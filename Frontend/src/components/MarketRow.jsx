const MARKET_TYPES = ['moneyline', 'spread', 'points_total']

export default function MarketRow({ index, market, onChange, onRemove, canRemove }) {
  const field = (key) => (e) => onChange(index, key, e.target.value)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Market {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Market type */}
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Market Type</label>
          <select
            value={market.market_type}
            onChange={field('market_type')}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {MARKET_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Confidence */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Confidence <span className="text-gray-400">(0–1)</span>
          </label>
          <input
            type="number" step="0.01" min="0" max="1"
            value={market.confidence}
            onChange={field('confidence')}
            placeholder="0.65"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* Prediction label */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Prediction Label</label>
          <input
            type="text"
            value={market.prediction}
            onChange={field('prediction')}
            placeholder="home_team wins"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Sportsbook A */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Bookmaker 1</label>
          <input
            type="text"
            value={market.bookmaker_1}
            onChange={field('bookmaker_1')}
            placeholder="DraftKings"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Price 1 <span className="text-gray-400">(American)</span>
          </label>
          <input
            type="number"
            value={market.price_1}
            onChange={field('price_1')}
            placeholder="-120"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Sportsbook B */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Bookmaker 2</label>
          <input
            type="text"
            value={market.bookmaker_2}
            onChange={field('bookmaker_2')}
            placeholder="ESPNBet"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Price 2 <span className="text-gray-400">(American)</span>
          </label>
          <input
            type="number"
            value={market.price_2}
            onChange={field('price_2')}
            placeholder="+115"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>
    </div>
  )
}
