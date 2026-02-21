/**
 * Mock node data for development and testing
 * This data can be used locally or synced with the API
 */

const teams = {
  basketball: [
    ['Houston Rockets', 'New York Knicks'], ['Los Angeles Lakers', 'Golden State Warriors'],
    ['Boston Celtics', 'Milwaukee Bucks'], ['Phoenix Suns', 'Denver Nuggets'],
    ['Brooklyn Nets', 'Miami Heat'], ['Chicago Bulls', 'Indiana Pacers'],
    ['Dallas Mavericks', 'San Antonio Spurs'], ['LA Clippers', 'Sacramento Kings'],
    ['Portland Trail Blazers', 'Utah Jazz'], ['Memphis Grizzlies', 'New Orleans Pelicans'],
    ['Atlanta Hawks', 'Charlotte Hornets'], ['Washington Wizards', 'Toronto Raptors'],
    ['Minnesota Timberwolves', 'Oklahoma City Thunder'], ['Cleveland Cavaliers', 'Detroit Pistons'],
    ['Philadelphia 76ers', 'Orlando Magic']
  ],
  football: [
    ['Kansas City Chiefs', 'Buffalo Bills'], ['Dallas Cowboys', 'Philadelphia Eagles'],
    ['San Francisco 49ers', 'Los Angeles Rams'], ['Miami Dolphins', 'New England Patriots'],
    ['Baltimore Ravens', 'Cincinnati Bengals'], ['Denver Broncos', 'Las Vegas Raiders'],
    ['Green Bay Packers', 'Minnesota Vikings'], ['Seattle Seahawks', 'Arizona Cardinals'],
    ['New Orleans Saints', 'Tampa Bay Buccaneers'], ['New York Giants', 'Washington Commanders'],
    ['Indianapolis Colts', 'Tennessee Titans'], ['Chicago Bears', 'Detroit Lions'],
    ['Atlanta Falcons', 'Carolina Panthers'], ['Houston Texans', 'Jacksonville Jaguars'],
    ['Pittsburgh Steelers', 'Cleveland Browns']
  ],
  baseball: [
    ['New York Yankees', 'Boston Red Sox'], ['Los Angeles Dodgers', 'San Francisco Giants'],
    ['Chicago Cubs', 'St. Louis Cardinals'], ['Atlanta Braves', 'New York Mets'],
    ['Houston Astros', 'Texas Rangers'], ['Toronto Blue Jays', 'Baltimore Orioles'],
    ['Minnesota Twins', 'Cleveland Guardians'], ['San Diego Padres', 'Arizona Diamondbacks'],
    ['Philadelphia Phillies', 'Milwaukee Brewers'], ['Detroit Tigers', 'Chicago White Sox'],
    ['Seattle Mariners', 'Oakland Athletics'], ['Tampa Bay Rays', 'Miami Marlins'],
    ['Cincinnati Reds', 'Pittsburgh Pirates'], ['Colorado Rockies', 'Los Angeles Angels'],
    ['Kansas City Royals', 'Washington Nationals']
  ],
  hockey: [
    ['Edmonton Oilers', 'Calgary Flames'], ['Toronto Maple Leafs', 'Montreal Canadiens'],
    ['Boston Bruins', 'New York Rangers'], ['Colorado Avalanche', 'Vegas Golden Knights'],
    ['Tampa Bay Lightning', 'Florida Panthers'], ['Pittsburgh Penguins', 'Washington Capitals'],
    ['St. Louis Blues', 'Chicago Blackhawks'], ['Dallas Stars', 'Minnesota Wild'],
    ['Anaheim Ducks', 'Los Angeles Kings'], ['Seattle Kraken', 'Vancouver Canucks'],
    ['San Jose Sharks', 'Arizona Coyotes'], ['New Jersey Devils', 'Philadelphia Flyers'],
    ['Columbus Blue Jackets', 'Buffalo Sabres'], ['Detroit Red Wings', 'Ottawa Senators'],
    ['Nashville Predators', 'Carolina Hurricanes']
  ]
};

const sportsbooks = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'PointsBet', 'Bet365', 'BetRivers', 'ESPNBet'];
const marketTypes = ['spread', 'moneyline', 'over/under'];

function random(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(random(min, max));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateNode(index) {
  const category = pick(Object.keys(teams));
  const [home_team, away_team] = pick(teams[category]);
  const market_type = pick(marketTypes);
  
  const profit_score = random(0.1, 0.95);
  const risk_score = random(0.15, 0.85);
  const confidence = random(0.35, 0.90);
  const volume = randomInt(50000, 500000);
  
  const dayOffset = randomInt(0, 30);
  const hour = randomInt(12, 23);
  const date = new Date(2025, 9, 20 + dayOffset, hour, 0, 0);
  
  const book1 = pick(sportsbooks);
  let book2 = pick(sportsbooks);
  while (book2 === book1) book2 = pick(sportsbooks);
  
  return {
    category,
    home_team,
    away_team,
    profit_score: Math.round(profit_score * 100) / 100,
    risk_score: Math.round(risk_score * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    volume,
    Date: date.toISOString(),
    market_type,
    sportsbooks: [
      { name: book1, odds: randomInt(-150, 200) },
      { name: book2, odds: randomInt(-150, 200) }
    ]
  };
}

export const mockNodes = Array.from({ length: 150 }, (_, i) => generateNode(i));

export default mockNodes;
