import { SourceAdapter } from './types'
import { saraminAdapter } from './saramin'

/** 사용 가능한 소스 어댑터 목록. 추가 시 여기에만 등록. */
export const ADAPTERS: SourceAdapter[] = [saraminAdapter]

export const ADAPTER_CATALOG = ADAPTERS.map(a => ({ id: a.id, label: a.label }))
