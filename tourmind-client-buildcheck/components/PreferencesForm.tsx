type Props = {
  budgetType: string;
  travelType: string;
  interests: string[];
  onBudgetTypeChange: (value: string) => void;
  onTravelTypeChange: (value: string) => void;
  onToggleInterest: (value: string) => void;
};

const INTEREST_OPTIONS = ["adventure", "spiritual", "relaxation", "food", "nature", "cultural", "nightlife"];

export default function PreferencesForm({
  budgetType,
  travelType,
  interests,
  onBudgetTypeChange,
  onTravelTypeChange,
  onToggleInterest
}: Props) {
  return (
    <section className="glass-card p-6">
      <h2 className="text-xl font-semibold text-base">Preferences</h2>
      <p className="mt-1 text-sm text-base/70">Tune suggestions with budget and travel style.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-base/80">
          Budget Type
          <select
            value={budgetType}
            onChange={event => onBudgetTypeChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-base/20 bg-white px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label className="text-sm font-medium text-base/80">
          Travel Type
          <select
            value={travelType}
            onChange={event => onTravelTypeChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-base/20 bg-white px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
          >
            <option value="solo">Solo</option>
            <option value="family">Family</option>
            <option value="friends">Friends</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {INTEREST_OPTIONS.map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => onToggleInterest(tag)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition ${
              interests.includes(tag)
                ? "border-accent bg-accent text-white"
                : "border-base/20 bg-white text-base/70 hover:border-accent"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </section>
  );
}
