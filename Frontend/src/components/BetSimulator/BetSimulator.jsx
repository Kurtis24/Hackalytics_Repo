import { useState, useEffect } from 'react';
import { 
  calculateMarketCeiling, 
  calculateLineMovement,
  calculateExpectedProfit,
  calculateSlippageRisk,
  calculateBetSplit 
} from '../../utils/arbitrageCalculations.js';

const PF = { fontFamily: "'Playfair Display', Georgia, serif" };

export default function BetSimulator({ selectedNode }) {
  const [betAmount, setBetAmount] = useState(100);
  const [expectedProfit, setExpectedProfit] = useState(0);
  const [slippageRisk, setSlippageRisk] = useState(0);
  const [edge, setEdge] = useState(0);
  const [sliderMin, setSliderMin] = useState(10);
  const [sliderMax, setSliderMax] = useState(2000);
  const [originalRisk, setOriginalRisk] = useState(0);

  // Initialize bet amount to the node's volume when node changes
  useEffect(() => {
    if (!selectedNode) return;

    // Start at the node's volume to match what's shown in node details
    const nodeVolume = selectedNode.volume || 100;
    setBetAmount(nodeVolume);

    // Set slider range: 50% below to 300% above the node's volume
    setSliderMin(Math.max(10, Math.floor(nodeVolume * 0.5)));
    setSliderMax(Math.ceil(nodeVolume * 3));

    // Calculate and store the original risk for this node at its original volume
    const lineMovement = calculateLineMovement(selectedNode.sportsbooks);
    const marketCeiling = calculateMarketCeiling(lineMovement, selectedNode.marketType);
    const originalSlippage = calculateSlippageRisk(nodeVolume, marketCeiling);
    setOriginalRisk(originalSlippage);
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode) return;

    // Calculate expected profit using backend arbitrage logic
    const profit = calculateExpectedProfit(betAmount, selectedNode.sportsbooks);
    setExpectedProfit(profit);

    // Calculate edge percentage (profit as % of bet amount)
    const edgePercent = betAmount > 0 ? (profit / betAmount) * 100 : 0;
    setEdge(edgePercent);

    // Calculate slippage risk
    const lineMovement = calculateLineMovement(selectedNode.sportsbooks);
    const marketCeiling = calculateMarketCeiling(lineMovement, selectedNode.marketType);
    const slippage = calculateSlippageRisk(betAmount, marketCeiling);
    setSlippageRisk(slippage);
  }, [betAmount, selectedNode]);

  if (!selectedNode) return null;

  const handleSliderChange = (e) => {
    setBetAmount(Number(e.target.value));
  };

  const riskLevel = slippageRisk < 30 ? 'Low' : slippageRisk < 60 ? 'Medium' : 'High';
  const riskColor = slippageRisk < 30 ? '#39ff14' : slippageRisk < 60 ? '#ffa500' : '#ff4444';

  // Get static execution from node's sportsbooks
  const staticExecution = selectedNode?.sportsbooks && selectedNode.sportsbooks.length >= 2
    ? {
        book1Name: selectedNode.sportsbooks[0].name,
        book1Odds: selectedNode.sportsbooks[0].odds,
        book1Stake: selectedNode.sportsbooks[0].stake || 0,
        book2Name: selectedNode.sportsbooks[1].name,
        book2Odds: selectedNode.sportsbooks[1].odds,
        book2Stake: selectedNode.sportsbooks[1].stake || 0,
      }
    : null;

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.6)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      borderRadius: '16px',
      padding: '32px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    }}>
      <h2 style={{
        ...PF,
        color: '#e8e8f0',
        fontSize: '28px',
        marginTop: 0,
        marginBottom: '24px',
        fontWeight: 400,
      }}>
        Simulator
      </h2>

      {/* Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '24px',
        marginBottom: '32px',
      }}>
        {/* Bet Amount */}
        <div>
          <div style={{
            ...PF,
            color: '#888',
            fontSize: '14px',
            marginBottom: '8px',
          }}>
            Volume Amount
          </div>
          <div style={{
            ...PF,
            color: '#e8e8f0',
            fontSize: '24px',
            fontWeight: 400,
          }}>
            ${betAmount}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '16px',
          }}>
            <span style={{ ...PF, color: '#666', fontSize: '12px' }}>${sliderMin}</span>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step="10"
              value={betAmount}
              onChange={handleSliderChange}
              style={{
                flex: 1,
                height: '4px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            />
            <span style={{ ...PF, color: '#666', fontSize: '12px' }}>${sliderMax}</span>
          </div>
        </div>

        {/* Expected Profit */}
        <div>
          <div style={{
            ...PF,
            color: '#888',
            fontSize: '14px',
            marginBottom: '8px',
          }}>
            Expected Profit
          </div>
          <div style={{
            ...PF,
            color: '#e8e8f0',
            fontSize: '24px',
            fontWeight: 400,
          }}>
            ${expectedProfit.toFixed(0)}
          </div>
          <div style={{
            ...PF,
            color: '#39ff14',
            fontSize: '16px',
            marginTop: '16px',
          }}>
            + {edge.toFixed(1)} % edge
          </div>
        </div>

        {/* Slippage Risk */}
        <div>
          <div style={{
            ...PF,
            color: '#888',
            fontSize: '14px',
            marginBottom: '8px',
          }}>
            Investment Risk
          </div>
          <div style={{
            ...PF,
            color: '#e8e8f0',
            fontSize: '24px',
            fontWeight: 400,
          }}>
            {slippageRisk.toFixed(0)}%
          </div>
          <div style={{
            ...PF,
            color: riskColor,
            fontSize: '16px',
            marginTop: '16px',
          }}>
            {riskLevel}
            {originalRisk > 0 && (() => {
              const riskChange = slippageRisk - originalRisk;
              const changeColor = riskChange > 0 ? '#ff4444' : '#39ff14';
              const changeSign = riskChange > 0 ? '+' : '';
              return (
                <span style={{ color: changeColor, fontSize: '14px', marginLeft: '8px' }}>
                  ({changeSign}{riskChange.toFixed(1)}%)
                </span>
              );
            })()}
          </div>
        </div>

        {/* Execution */}
        <div>
          <div style={{
            ...PF,
            color: '#888',
            fontSize: '14px',
            marginBottom: '8px',
          }}>
            Execution
          </div>
          <div style={{
            ...PF,
            color: '#e8e8f0',
            fontSize: '13px',
            lineHeight: '1.8',
          }}>
            {staticExecution ? (
              <>
                <div>Buy {selectedNode.homeTeam} At {staticExecution.book1Odds > 0 ? '+' : ''}{staticExecution.book1Odds} on {staticExecution.book1Name}</div>
                <div style={{ marginTop: '4px' }}>Buy {selectedNode.awayTeam} At {staticExecution.book2Odds > 0 ? '+' : ''}{staticExecution.book2Odds} on {staticExecution.book2Name}</div>
              </>
            ) : (
              'N/A'
            )}
          </div>
        </div>
      </div>

      {/* Warning Message */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(180, 58, 58, 0.3) 0%, rgba(139, 69, 19, 0.2) 100%)',
        border: '1px solid rgba(180, 58, 58, 0.5)',
        borderRadius: '8px',
        padding: '16px 20px',
        ...PF,
        color: '#e8e8f0',
        fontSize: '14px',
      }}>
        Warning: Just because their is more profit, the market could correct more
      </div>

      {/* Slider Custom Styling */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          background: #39ff14;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 8px rgba(57, 255, 20, 0.5);
        }
        
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: #39ff14;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 8px rgba(57, 255, 20, 0.5);
        }
        
        input[type="range"]::-webkit-slider-runnable-track {
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        
        input[type="range"]::-moz-range-track {
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
