import { DIFFICULTIES } from '@/lib/catalog'

interface RoundProgressProps {
  index: number
  total: number
  difficulty: number
}

export default function RoundProgress({ index, total, difficulty }: RoundProgressProps) {
  const label = DIFFICULTIES.find((item) => item.value === difficulty)?.short
  return (
    <div className="round-progress">
      <p className="round-counter">
        Question {index} / {total}
      </p>
      <span className="round-difficulty" aria-label="Difficulté de la question">
        {label}
      </span>
    </div>
  )
}
