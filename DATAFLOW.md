
## Data flow

```mermaid
flowchart TB
    subgraph External["External APIs & Data"]
        ESPN["ESPN (NBA, NFL)"]
        MLB["MLB Stats API"]
        NHL["NHL API"]
        Delta["Delta Lake / Databricks"]
    end

    subgraph Backend["Backend (FastAPI)"]
        subgraph GamesSv["Games Service"]
            GS_Upcoming["get_all_upcoming_games()"]
            GS_Live["get_all_live_games()"]
            GS_All["get_all_games()"]
            GS_ML["get_games_for_ml(150)"]
        end

        subgraph LeagueSv["League Services"]
            NBA["nba_service"]
            MLB_S["mlb_service"]
            NFL["nfl_service"]
            NHL_S["nhl_service"]
        end

        subgraph Pipeline["Execute Pipeline"]
            DeltaSv["delta_lake_service\n(fetch_upcoming_games,\nfetch_odds_for_games)"]
            GamePred["game_prediction_service\n(get_all_game_predictions)"]
            LocalML["local_model_service\n(TemporalArbitrageScorer)"]
            MLService["ml_service\n(fetch_all_predictions)"]
            ArbRouter["arbitrage router\n(_market_to_node)"]
        end

        subgraph Store["In-Memory Store"]
            NodesStore["_nodes_store"]
        end

        Routers["/api/v1/games\n/games/live\n/games/all"]
        ArbExecute["POST /arbitrage/execute"]
        MLRun["POST /ml/run"]
        NodesAPI["GET /nodes\nPOST /nodes/bulk"]
    end

    subgraph Frontend["Frontend (React)"]
        DataCtx["DataContext\n(arbitrageData, dataMode,\ngetNodes, updateArbitrageData)"]
        ExecutePage["Execute page\n(Execute Backend,\nLoad from ML,\nUse Mock)"]
        NodeView["NodeView\n(3D graph)"]
        NodeRender["NodeRender\n(SceneManager)"]
        MockData["mockNodes.js\n(150 sample nodes)"]
    end

    ESPN --> NBA
    ESPN --> NFL
    MLB --> MLB_S
    NHL --> NHL_S

    NBA --> GS_Upcoming
    MLB_S --> GS_Upcoming
    NFL --> GS_Upcoming
    NHL_S --> GS_Upcoming
    NBA --> GS_Live
    MLB_S --> GS_Live
    NFL --> GS_Live
    NHL_S --> GS_Live

    GS_Upcoming --> GS_All
    GS_Live --> GS_All
    GS_All --> GS_ML

    GS_Upcoming --> Routers
    GS_Live --> Routers
    GS_All --> Routers

    Delta --> DeltaSv
    DeltaSv --> GamePred
    GamePred --> LocalML
    LocalML --> GamePred
    ArbExecute --> MLService
    MLService --> GamePred
    GamePred --> MLService
    MLService --> ArbRouter
    ArbRouter --> ArbExecute

    MLRun --> MLService
    MLService --> NodesStore
    NodesStore --> NodesAPI

    ArbExecute --> ExecutePage
    NodesAPI --> ExecutePage
    ExecutePage --> DataCtx
    MockData --> DataCtx
    DataCtx --> NodeView
    NodeView --> NodeRender
```

### Flow summary

| Stage | What happens |
|-------|----------------|
| **1. Games** | League services (NBA, MLB, NFL, NHL) fetch from ESPN / MLB / NHL APIs. `games_service` aggregates them and can select up to 150 games evenly per sport for ML (`get_games_for_ml`). Exposed as `GET /games`, `/games/live`, `/games/all`. |
| **2. Execute pipeline** | **Execute Backend** triggers `POST /arbitrage/execute`. Backend calls `fetch_all_predictions()` → `game_prediction_service.get_all_game_predictions()` which pulls **games + odds** from Delta Lake (or sample fallback), runs the **local ML model** (TemporalArbitrageScorer) per game × market, then the arbitrage router converts each market to a **node** (profit_score, risk_score, confidence, etc.). Returns a flat list of nodes to the frontend. |
| **3. ML run (optional)** | `POST /ml/run` runs the same prediction pipeline and can **append** results to the in-memory nodes store. |
| **4. Nodes store** | In-memory `_nodes_store` is filled by `POST /ml/run?store=true` or `POST /nodes/bulk`. `GET /nodes` returns the current list. **Load from ML** in the frontend calls `GET /nodes` and loads that list into the app. |
| **5. Frontend** | **Execute Backend** → `POST /arbitrage/execute` → nodes → `updateArbitrageData(nodes)` (live mode). **Load from ML** → `GET /nodes` → `updateArbitrageData(nodes)`. **Use Mock** → `resetToMock()` so `getNodes()` returns built-in mock data. NodeView reads `getNodes()` from DataContext and passes them to NodeRender (3D scene). |

Everything is synchronous per request: the backend waits for games, then Delta Lake/odds, then local ML, then returns nodes. The frontend waits for the API response before updating the graph.

---