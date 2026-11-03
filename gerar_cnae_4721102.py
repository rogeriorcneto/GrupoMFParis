import csv
import io
import os
import sqlite3
import sys
import urllib.parse
import zipfile
from pathlib import Path

import requests
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

BASE = "https://arquivos.receitafederal.gov.br/public.php/webdav/Dados/Cadastros/CNPJ/2026-08"
AUTH = ("gn672Ad4CF8N6TK", "")
TARGETS = {"4721102", "1091102"}
ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "dados_cnpj_2026-08"
DB = ROOT / "cnaes_4721102_1091102.sqlite"
OUTPUT = Path.home() / "Desktop" / "Empresas_Ativas_CNAEs_4721-1-02_e_1091-1-02_Brasil.xlsx"


def download(name):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if path.exists() and path.stat().st_size > 0:
        return path
    url = f"{BASE}/{urllib.parse.quote(name)}"
    print(f"Baixando {name}...", flush=True)
    with requests.get(url, auth=AUTH, stream=True, timeout=(30, 300)) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length", 0))
        received = 0
        temp = path.with_suffix(path.suffix + ".part")
        with temp.open("wb") as output:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    output.write(chunk)
                    received += len(chunk)
                    if total and received % (100 * 1024 * 1024) < len(chunk):
                        print(f"  {received / 1048576:.0f}/{total / 1048576:.0f} MB", flush=True)
        temp.replace(path)
    return path


def rows(name):
    path = download(name)
    with zipfile.ZipFile(path) as archive:
        member = archive.namelist()[0]
        with archive.open(member) as raw, io.TextIOWrapper(raw, encoding="latin-1", newline="") as text:
            yield from csv.reader(text, delimiter=";")


def clean(value):
    return (value or "").strip()


def format_cnpj(base, order, dv):
    number = f"{base}{order}{dv}"
    return f"{number[:2]}.{number[2:5]}.{number[5:8]}/{number[8:12]}-{number[12:]}"


def format_cnae(code):
    code = clean(code)
    return f"{code[:4]}-{code[4]}/{code[5:]}" if len(code) == 7 else code


def load_lookup(name):
    return {clean(row[0]): clean(row[1]) for row in rows(name)}


def setup_db():
    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE estab (cnpj_basico TEXT, cnpj TEXT PRIMARY KEY, nome_fantasia TEXT, data_inicio TEXT, cnae_principal TEXT, cnaes_secundarios TEXT, tipo_logradouro TEXT, logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT, cep TEXT, uf TEXT, municipio_codigo TEXT, ddd1 TEXT, telefone1 TEXT, ddd2 TEXT, telefone2 TEXT, email TEXT)")
    con.execute("CREATE INDEX estab_base_idx ON estab(cnpj_basico)")
    con.execute("CREATE TABLE empresa (cnpj_basico TEXT PRIMARY KEY, razao_social TEXT)")
    con.execute("CREATE TABLE socio (cnpj_basico TEXT, nome TEXT)")
    con.execute("CREATE INDEX socio_base_idx ON socio(cnpj_basico)")
    return con


def process_establishments(con):
    insert = "INSERT OR REPLACE INTO estab VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    count = 0
    for part in range(10):
        batch = []
        for row in rows(f"Estabelecimentos{part}.zip"):
            if len(row) < 30 or clean(row[5]) != "02":
                continue
            principal = clean(row[11])
            secondary = clean(row[12])
            establishment_cnaes = {principal, *(x.strip() for x in secondary.split(","))}
            if TARGETS.isdisjoint(establishment_cnaes):
                continue
            batch.append((clean(row[0]), format_cnpj(clean(row[0]), clean(row[1]), clean(row[2])), clean(row[4]), clean(row[10]), principal, secondary, clean(row[13]), clean(row[14]), clean(row[15]), clean(row[16]), clean(row[17]), clean(row[18]), clean(row[19]), clean(row[20]), clean(row[21]), clean(row[22]), clean(row[23]), clean(row[24]), clean(row[27])))
            if len(batch) >= 5000:
                con.executemany(insert, batch)
                count += len(batch)
                batch.clear()
        con.executemany(insert, batch)
        count += len(batch)
        con.commit()
        print(f"Estabelecimentos selecionados: {count}", flush=True)
    return count


def process_companies(con):
    wanted = {row[0] for row in con.execute("SELECT DISTINCT cnpj_basico FROM estab")}
    for part in range(10):
        batch = []
        for row in rows(f"Empresas{part}.zip"):
            if clean(row[0]) in wanted:
                batch.append((clean(row[0]), clean(row[1])))
        con.executemany("INSERT OR REPLACE INTO empresa VALUES (?,?)", batch)
        con.commit()
        print(f"Empresas: parte {part + 1}/10", flush=True)


def process_partners(con):
    wanted = {row[0] for row in con.execute("SELECT DISTINCT cnpj_basico FROM estab")}
    for part in range(10):
        batch = []
        for row in rows(f"Socios{part}.zip"):
            if clean(row[0]) in wanted and len(row) > 2:
                batch.append((clean(row[0]), clean(row[2])))
        con.executemany("INSERT INTO socio VALUES (?,?)", batch)
        con.commit()
        print(f"Sócios: parte {part + 1}/10", flush=True)


def describe_cnaes(value, cnaes):
    result = []
    for code in (x.strip() for x in clean(value).split(",")):
        if code:
            result.append(f"{format_cnae(code)} - {cnaes.get(code, '')}".rstrip(" -"))
    return " | ".join(result)


def generate_excel(con, cnaes, municipios):
    wb = Workbook(write_only=True)
    ws = wb.create_sheet("Empresas")
    headers = ["UF", "Município", "CNPJ", "Razão social", "Nome fantasia", "CNAE principal", "CNAEs secundários", "Sócios", "Endereço completo", "Tipo de logradouro", "Logradouro", "Número", "Complemento", "Bairro", "CEP", "Telefone 1", "Telefone 2", "E-mail", "Data de início da atividade"]
    ws.append(headers)
    query = """SELECT e.uf,e.municipio_codigo,e.cnpj,COALESCE(p.razao_social,''),e.nome_fantasia,e.cnae_principal,e.cnaes_secundarios,COALESCE((SELECT group_concat(nome,' | ') FROM (SELECT DISTINCT nome FROM socio s WHERE s.cnpj_basico=e.cnpj_basico ORDER BY nome)),''),e.tipo_logradouro,e.logradouro,e.numero,e.complemento,e.bairro,e.cep,e.ddd1,e.telefone1,e.ddd2,e.telefone2,e.email,e.data_inicio FROM estab e LEFT JOIN empresa p ON p.cnpj_basico=e.cnpj_basico ORDER BY e.uf,e.municipio_codigo,p.razao_social"""
    for row in con.execute(query):
        uf, mun_code, cnpj, razao, fantasia, principal, secondary, partners, tipo, street, number, complement, district, cep, ddd1, phone1, ddd2, phone2, email, started = row
        city = municipios.get(mun_code, mun_code)
        address = " ".join(x for x in [tipo, street, number] if x)
        if complement:
            address += f", {complement}"
        if district:
            address += f" - {district}"
        address += f" - {city}/{uf}"
        if cep:
            address += f" - CEP {cep[:5]}-{cep[5:]}" if len(cep) == 8 else f" - CEP {cep}"
        phone_1 = f"({ddd1}) {phone1}" if phone1 else ""
        phone_2 = f"({ddd2}) {phone2}" if phone2 else ""
        start_date = f"{started[6:8]}/{started[4:6]}/{started[:4]}" if len(started) == 8 else started
        ws.append([uf, city, cnpj, razao, fantasia, f"{format_cnae(principal)} - {cnaes.get(principal, '')}".rstrip(" -"), describe_cnaes(secondary, cnaes), partners, address, tipo, street, number, complement, district, cep, phone_1, phone_2, email, start_date])
    info = wb.create_sheet("Informações")
    info.append(["Campo", "Valor"])
    info.append(["Fonte", "Dados Abertos do CNPJ - Receita Federal do Brasil"])
    info.append(["Competência da base", "2026-08"])
    info.append(["Critério", "Situação cadastral ativa (02) e CNAE 4721-1/02 ou 1091-1/02 como principal ou secundário"])
    info.append(["Observação", "Campos sem informação permanecem em branco conforme a base pública."])
    wb.save(OUTPUT)

    wb = load_workbook(OUTPUT)
    ws = wb["Empresas"]
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    ws.sheet_view.showGridLines = False
    fill = PatternFill("solid", fgColor="1F4E78")
    for cell in ws[1]:
        cell.font = Font(color="FFFFFF", bold=True)
        cell.fill = fill
    widths = [8, 24, 20, 38, 32, 50, 70, 60, 65, 18, 35, 12, 25, 25, 12, 20, 20, 35, 18]
    for index, width in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(index)].width = width
    info = wb["Informações"]
    info.column_dimensions["A"].width = 28
    info.column_dimensions["B"].width = 90
    info.freeze_panes = "A2"
    info.auto_filter.ref = info.dimensions
    for cell in info[1]:
        cell.font = Font(color="FFFFFF", bold=True)
        cell.fill = fill
    wb.save(OUTPUT)


def main():
    cnaes = load_lookup("Cnaes.zip")
    municipios = load_lookup("Municipios.zip")
    con = setup_db()
    count = process_establishments(con)
    if not count:
        raise RuntimeError("Nenhum estabelecimento encontrado")
    process_companies(con)
    process_partners(con)
    generate_excel(con, cnaes, municipios)
    con.close()
    print(f"Arquivo gerado: {OUTPUT}", flush=True)


if __name__ == "__main__":
    main()
