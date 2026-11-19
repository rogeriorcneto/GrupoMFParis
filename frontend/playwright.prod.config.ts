import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  use: { ...baseConfig.use, baseURL: 'https://crm-grupomfparis.netlify.app' },
  webServer: undefined,
})
