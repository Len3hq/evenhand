/** A team's answers to the organisers' questions, as the API chose to show them to this viewer. */
export function Answers({
  answers,
  className,
}: {
  answers: { prompt: string; value: string }[];
  className?: string;
}) {
  if (!answers.length) return null;
  return (
    <dl className={className}>
      {answers.map((a) => (
        <div key={a.prompt} className="mt-3 first:mt-0">
          <dt className="text-sm font-semibold">{a.prompt}</dt>
          <dd className="mt-1 whitespace-pre-line">{a.value}</dd>
        </div>
      ))}
    </dl>
  );
}
