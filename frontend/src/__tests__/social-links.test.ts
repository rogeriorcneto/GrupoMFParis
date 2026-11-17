import { describe, it, expect } from 'vitest'
import { extractValidSocialLinks, parseRedesSociaisMap } from '../utils/socialLinks'

describe('socialLinks — parser de redes sociais (Item 13)', () => {
  it('extrai links válidos do formato importado "Instagram: url | Facebook: url" sem gerar instagram.com/instagram:', () => {
    const links = extractValidSocialLinks({
      redesSociais: 'Facebook: https://www.facebook.com/flocossorveteria/ | Instagram: https://www.instagram.com/flocossorveteria/',
    })
    expect(links.map(l => l.url)).toEqual([
      'https://www.instagram.com/flocossorveteria/',
      'https://www.facebook.com/flocossorveteria/',
    ])
  })

  it('extrai links válidos de JSON string sem gerar https://com.br"}', () => {
    const json = JSON.stringify({
      instagram: 'https://instagram.com/sorvemax',
      website: 'https://sorvemax.com.br',
    })
    const links = extractValidSocialLinks({ redesSociais: json })
    expect(links.map(l => l.url)).toEqual([
      'https://instagram.com/sorvemax',
      'https://sorvemax.com.br/',
    ])
  })

  it('descarta links quebrados legados como instagram.com/instagram: e https://com.br"}', () => {
    const map = parseRedesSociaisMap('https://instagram.com/instagram:, https://com.br"}, @lojareal')
    expect(map.instagram).toBe('https://instagram.com/lojareal')
    expect(map.website).toBeUndefined()
  })
})
