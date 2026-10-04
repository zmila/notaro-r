import { forwardRef, useMemo } from 'react'
import { highlightHtml, markdownHtml } from '../markdown'

interface MarkdownContentProps {
  value: string
  terms?: string[]
  className?: string
  tabIndex?: number
}

export const MarkdownContent = forwardRef<HTMLDivElement, MarkdownContentProps>(function MarkdownContent(
  { value, terms = [], className, tabIndex },
  ref,
) {
  const html = useMemo(() => {
    const rendered = markdownHtml(value)
    return terms.length > 0 ? highlightHtml(rendered, terms) : rendered
  }, [terms, value])

  return <div ref={ref} className={className} tabIndex={tabIndex} dangerouslySetInnerHTML={{ __html: html }} />
})
