import { BudgetEstimate } from "@/lib/types";

type Props = {
  budget: BudgetEstimate;
};

export default function BudgetBreakdown({ budget }: Props) {
  return (
    <section className="glass-card p-6">
      <h2 className="text-xl font-semibold text-base">Budget Breakdown</h2>
      <p className="mt-1 text-sm text-base/70">
        {budget.days}-day {budget.travelType} plan, {budget.budgetCategory} budget profile.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-base/15 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-base/55">Transport</p>
          <p className="mt-2 text-lg font-semibold text-base">INR {budget.breakdown.transport}</p>
        </article>
        <article className="rounded-xl border border-base/15 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-base/55">Stay</p>
          <p className="mt-2 text-lg font-semibold text-base">INR {budget.breakdown.accommodation}</p>
        </article>
        <article className="rounded-xl border border-base/15 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-base/55">Food</p>
          <p className="mt-2 text-lg font-semibold text-base">INR {budget.breakdown.food}</p>
        </article>
        <article className="rounded-xl border border-base/15 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-base/55">Misc</p>
          <p className="mt-2 text-lg font-semibold text-base">INR {budget.breakdown.misc}</p>
        </article>
      </div>

      <div className="mt-4 rounded-xl border border-accent/20 bg-accent/10 p-4">
        <p className="text-sm font-semibold text-base">Total Estimated Cost: INR {budget.total}</p>
        <p className="text-sm text-base/75">Daily Average: INR {budget.dailyAverage}</p>
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-base/75">
        {budget.notes.map(note => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
