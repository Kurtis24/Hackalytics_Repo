# Dataset for Classifying Future Mispricing Events

Training Features
- datetime
- game_start (same as datetime if predicting for a future game)
- league
- team_a
- team_b
- points_spread (0 if future game)
- points_total (0 if future game)
- game_duration (fraction of the game completed)
- bookmaker (categorical variable)
- price_current (target variable)

Model: predict the current price for a specific game and bookmaker. 

Run predictions for a list of bookmakers to determine if a mispricing opportunity will appear in the future.

DraftKings
FanDuel
Fanatics