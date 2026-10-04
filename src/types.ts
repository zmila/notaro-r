export interface Note {
  id: number
  created_at: string
  updated_at: string
  title: string
  body: string
  tags: string[]
}

export type SortField = 'created' | 'updated' | 'title'
export type SortDirection = 'asc' | 'desc'

export interface NoteDraft {
  title: string
  body: string
  tags: string
}
