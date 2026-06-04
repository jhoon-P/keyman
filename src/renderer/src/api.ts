// window.api 브리지 타입 선언
import type { ElectronAPI } from '../../preload/index'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export const api = window.api
