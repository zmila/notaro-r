import { forwardRef, useMemo, type CSSProperties } from 'react'
import { highlightHtml, markdownHtml } from '../markdown'

interface MarkdownContentProps {
  value: string
  terms?: string[]
  className?: string
  tabIndex?: number
  style?: CSSProperties
}

export const MarkdownContent = forwardRef<HTMLDivElement, MarkdownContentProps>(function MarkdownContent(
  { value, terms = [], className, tabIndex, style },
  ref,
) {
  const html = useMemo(() => {
    const rendered = markdownHtml(value)
    return terms.length > 0 ? highlightHtml(rendered, terms) : rendered
  }, [terms, value])

  return <div ref={ref} className={className} tabIndex={tabIndex} style={style} dangerouslySetInnerHTML={{ __html: html }} />
})
