interface QuestionDetailsProps {
  explanation: string
  source?: { label: string; url: string }
}

/** Le complément culturel reste accessible sans encombrer la question. */
export default function QuestionDetails({ explanation, source }: QuestionDetailsProps) {
  return (
    <details className="disclosure question-details">
      <summary>Explication et source</summary>
      <div className="disclosure-content">
        <p>{explanation}</p>
        {source?.url ? (
          <a className="text-link" href={source.url} target="_blank" rel="noreferrer">
            {source.label}
          </a>
        ) : source?.label ? (
          <span className="muted">{source.label}</span>
        ) : null}
      </div>
    </details>
  )
}
