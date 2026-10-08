/**
 * The Agents handbook (web: client/src/features/agents/pages/AgentsDocs.tsx) — what each agent
 * reads and returns, the three workflows step by step, where code takes over from the model, and
 * how to read each screen. Static copy describing the current code, not live job state; the
 * schedule figures are the server's and ai-service's own constants.
 */

export type FlowKey = 'options' | 'holdings' | 'research';

export interface FlowStep {
  title: string;
  owner: string;
  explanation: string;
  receives: string;
  handsOff: string;
}

export interface Flow {
  key: FlowKey;
  label: string;
  summary: string;
  steps: FlowStep[];
}

export const FLOWS: readonly Flow[] = [
  {
    key: 'options',
    label: 'Index options',
    summary:
      'A debate can suggest a trade. The platform still decides whether even a paper order is allowed.',
    steps: [
      {
        title: 'Gather evidence',
        owner: 'Platform server',
        explanation:
          'The server looks at fresh Groww index futures, option prices and volume, plus recent news and its saved analysis.',
        receives: 'Current market data and news',
        handsOff: 'A limited evidence packet; no broker credentials',
      },
      {
        title: 'Make the bull case',
        owner: 'Bullish Researcher',
        explanation:
          'It asks whether the evidence supports an upward index move and a long call. It can also say the case is weak.',
        receives: 'The evidence packet',
        handsOff: 'Reasons, counter-questions and a subjective conviction score',
      },
      {
        title: 'Challenge it',
        owner: 'Bearish Researcher',
        explanation:
          'It tests the opposite view, looks for weakness in the bull case and considers a long put.',
        receives: 'The same evidence and bullish argument',
        handsOff: 'A bearish argument and its challenge',
      },
      {
        title: 'Reply once',
        owner: 'Bullish Researcher',
        explanation:
          'The bullish researcher responds to the bearish challenge — a second turn by the same agent, not a fifth agent.',
        receives: 'The bearish challenge',
        handsOff: 'A rebuttal for the trader to compare',
      },
      {
        title: 'Suggest or hold',
        owner: 'Index Options Trader',
        explanation:
          'It compares both sides and returns BUY_CALL, BUY_PUT or HOLD with a reason and a proposed premium stop and target.',
        receives: 'Both arguments and the rebuttal',
        handsOff: 'A proposal only — never an order',
      },
      {
        title: 'Check the rules',
        owner: 'Server code · not AI',
        explanation:
          'Plain code rechecks the quote, liquidity, direction, limits, costs and historical evidence. A missing or failed check means HOLD.',
        receives: 'The proposal and fresh Groww data',
        handsOff: 'An allowed paper entry or a recorded HOLD reason',
      },
      {
        title: 'Paper & monitor',
        owner: 'Platform server',
        explanation:
          'If permitted, the server places a simulated option buy and monitors its stop, target and one-hour limit. Live automated orders remain unavailable.',
        receives: 'An approved paper entry',
        handsOff: 'A paper order, exit and decision record',
      },
    ],
  },
  {
    key: 'holdings',
    label: 'Holding reviews',
    summary:
      'Each enabled hourly run combines the connected Groww and mStock books with measured market data and independently checked web research.',
    steps: [
      {
        title: 'Read the book',
        owner: 'Platform server',
        explanation:
          'The server refreshes the connected Groww and mStock equity books. A stock held in both is one position (shares and cost added). It records the quantity, average price, current value and weight across both books for each holding.',
        receives: 'The signed-in user and connected Groww and mStock accounts',
        handsOff: 'One bounded evidence packet per priced equity holding',
      },
      {
        title: 'Measure the chart',
        owner: 'Platform server',
        explanation:
          'Plain code calculates daily SMA, RSI, 20-session return, prior-range levels and completed-day volume from saved bars. Current-session volume stays separate.',
        receives: 'Completed daily bars and the latest market snapshot',
        handsOff: 'Measured technical values and explicit data warnings',
      },
      {
        title: 'Read the company',
        owner: 'Web Research',
        explanation:
          'The child researcher looks for recent filings, results, material announcements, regulatory risks and contrary evidence, then verifies its fetched references.',
        receives: 'Company identity, ticker and a shareholder-focused question',
        handsOff: 'Checked findings, source links and open questions',
      },
      {
        title: 'Assess both sides',
        owner: 'Holding Review',
        explanation:
          'The reviewer compares the holding and measured market data with the checked company research. It must state both the supporting and the counter-case.',
        receives: 'The portfolio, technicals, saved news and verified web findings',
        handsOff: 'A research label, thesis, risks and what could change the view',
      },
      {
        title: 'Apply the evidence gate',
        owner: 'Verifier code · not AI',
        explanation:
          'Code downgrades add or sell labels when the portfolio or daily data is stale, key metrics are missing, or fewer than two independent checked findings are available.',
        receives: 'The draft assessment and evidence-quality checks',
        handsOff: 'A conservative final review or NEEDS_REVIEW',
      },
      {
        title: 'Save the review',
        owner: 'Platform worker',
        explanation:
          'The worker polls the AI job, validates that the result matches the requested holding and stores the latest report for the signed-in user.',
        receives: 'A validated AI-service result',
        handsOff: 'A read-only report; never a real or paper order',
      },
    ],
  },
  {
    key: 'research',
    label: 'Web research',
    summary:
      'One agent searches and reads; code checks its references and cited numbers before returning the report.',
    steps: [
      {
        title: 'Ask a question',
        owner: 'Calling service',
        explanation:
          'A caller submits a question and can narrow the time range, domains or research depth.',
        receives: 'A research question',
        handsOff: 'A bounded research job',
      },
      {
        title: 'Search the web',
        owner: 'Web Research',
        explanation:
          'The agent uses SearXNG to find relevant pages. Search snippets are leads, not final evidence.',
        receives: 'The question and search limits',
        handsOff: 'Candidate pages to read',
      },
      {
        title: 'Read sources',
        owner: 'Web Research',
        explanation:
          'It fetches pages and saves what it read, so later claims can point to actual source pages.',
        receives: 'Search results',
        handsOff: 'Saved, numbered sources',
      },
      {
        title: 'Write findings',
        owner: 'Web Research',
        explanation:
          'The model drafts an answer, key findings, source references and open questions.',
        receives: 'The text of fetched pages',
        handsOff: 'A draft with citations',
      },
      {
        title: 'Verify references',
        owner: 'Verifier code · not AI',
        explanation:
          'Code rejects findings without a fetched source, looks for cited numbers in those pages and caps confidence. It cannot prove that a source supports every interpretation.',
        receives: 'The draft and saved pages',
        handsOff: 'Checked references and clearly marked gaps',
      },
      {
        title: 'Return the report',
        owner: 'AI service',
        explanation:
          'The finished job holds a cited answer, findings, sources and what remains uncertain. IPO reports may use it as an optional deep-read layer.',
        receives: 'Verified findings',
        handsOff: 'A research result for the caller',
      },
    ],
  },
];

export interface DirectoryEntry {
  id: string;
  name: string;
  category: string;
  plain: string;
  receives: string;
  produces: string;
  boundary: string;
}

/** The five agents registered in the ai-service (ai-service/src/agents/index.ts). */
export const DIRECTORY: readonly DirectoryEntry[] = [
  {
    id: 'web-research',
    name: 'Web Research',
    category: 'Independent research',
    plain:
      'Looks up a question on the open web, reads pages and writes an answer you can trace back to sources.',
    receives: 'A question, optional research depth, time range and domain limits.',
    produces:
      'A cited answer, citation-checked findings, confidence labels, sources and open questions.',
    boundary:
      'It cannot place trades. Code checks citations and numbers after the model writes; still read important sources.',
  },
  {
    id: 'index-bullish-researcher',
    name: 'Bullish Researcher',
    category: 'Index debate',
    plain:
      'Argues for an upward index move only when the supplied market and news evidence supports it.',
    receives:
      'Index movement, futures and option volume, current prices and recent news; later, the bearish challenge.',
    produces:
      'A bullish case with evidence, a challenge and a subjective conviction score; then one rebuttal.',
    boundary: 'It does not fetch its own broker data or send an order.',
  },
  {
    id: 'index-bearish-researcher',
    name: 'Bearish Researcher',
    category: 'Index debate',
    plain: 'Tests the downside case and presses on weaknesses in the bullish argument.',
    receives: 'The same market and news evidence, and the first bullish case.',
    produces: 'A bearish case, a challenge and a subjective conviction score.',
    boundary: 'It does not fetch its own broker data or send an order.',
  },
  {
    id: 'index-options-trader',
    name: 'Index Options Trader',
    category: 'Proposal only',
    plain: 'Listens to the debate and proposes a long call, a long put or no trade.',
    receives: 'The evidence packet, bullish case, bearish challenge and bullish rebuttal.',
    produces: 'BUY_CALL, BUY_PUT or HOLD, a reason and proposed premium stop / target percentages.',
    boundary:
      'Its confidence is an opinion, not a measured win probability. The server alone checks risk and execution.',
  },
  {
    id: 'holding-review',
    name: 'Holding Review',
    category: 'Portfolio research',
    plain:
      'Reviews one connected Groww or mStock equity holding against measured daily patterns, saved news and independently checked web evidence.',
    receives:
      'Quantity and pricing, completed daily bars, current-session volume, recent company news and a verified Web Research report.',
    produces:
      'A research label, a two-sided thesis, risks, evidence quality, sources and the questions that remain open.',
    boundary:
      'It cannot place a real or paper order. Missing, stale or weakly corroborated evidence forces NEEDS_REVIEW instead of an add or sell label.',
  },
];

export interface ScheduleFact {
  label: string;
  value: string;
}

/** When each agent runs and the limits it works inside. */
export const SCHEDULES: readonly { agent: string; access: string; facts: ScheduleFact[] }[] = [
  {
    agent: 'Index trading',
    access: 'Administrators',
    facts: [
      { label: 'Runs', value: 'Every 15 minutes, 09:30–14:15 IST (5–60 on Controls)' },
      { label: 'Mode', value: 'Paper (F&O paper book) until an administrator deploys it live' },
      {
        label: 'Caps',
        value:
          'Trades a day, daily loss, risk a trade, a stop of 10% at most and lots — set on Controls',
      },
      { label: 'Exit', value: 'Stop, target or a one-hour time limit' },
    ],
  },
  {
    agent: 'Portfolio review',
    access: 'Everyone · your own Groww and mStock books',
    facts: [
      { label: 'Runs', value: 'Hourly when switched on, or on demand with Run now' },
      {
        label: 'Holdings',
        value: 'Up to 100 equity holdings across both books; a stock in both is one review',
      },
      { label: 'Deadline', value: 'A review not done within an hour is cancelled and retried' },
      { label: 'Kept', value: '14 days of reviews; the last 24 per holding as its trail' },
      { label: 'Orders', value: 'None — research labels only' },
    ],
  },
  {
    agent: 'Web research',
    access: 'Administrators · IPO reports',
    facts: [
      { label: 'Runs', value: 'On demand, and for IPO reports' },
      { label: 'Quick', value: 'Up to 3 searches · 4 pages read' },
      { label: 'Standard', value: 'Up to 5 searches · 8 pages read' },
      { label: 'Deep', value: 'Up to 8 searches · 14 pages read — slowest' },
      { label: 'Question', value: '3–500 characters; guidance up to 1,000' },
    ],
  },
];

/** How to read each Agents screen. */
export const READING_GUIDE: readonly { screen: string; points: string[] }[] = [
  {
    screen: 'Overview',
    points: [
      'One card per agent: its state, its headline numbers and the last thing it did.',
      'Recent activity merges every agent, newest first. Tap a row to open the record.',
    ],
  },
  {
    screen: 'Portfolio review',
    points: [
      'Accumulate — the evidence argues for adding. Hold — keep and watch. Reduce — a second look at the position size. Under review — not enough evidence for a view.',
      '“Changed” marks a verdict that flipped in the last 24 hours.',
      'The trail shows recent reviews oldest to newest; an outlined cell had no verdict that hour.',
    ],
  },
  {
    screen: 'Web research',
    points: [
      'Confidence is set after verification: high when several independent pages agree, low when a cited number is on no page read.',
      'Corroboration counts the distinct sites behind a finding. Credibility is a 0–100 heuristic per page.',
      'Claims dropped by verification are listed separately, with the reason.',
    ],
  },
  {
    screen: 'Index trading',
    points: [
      'HOLD is the normal outcome of most scans — the reason says which check stopped it.',
      'Paper P&L is simulated fills less estimated charges; it is not a contract note.',
    ],
  },
];

export const TERMS: readonly { term: string; meaning: string }[] = [
  {
    term: 'Model conviction',
    meaning: 'A researcher’s own strength-of-case score. It is not a measured chance of winning.',
  },
  {
    term: 'Historical edge',
    meaning:
      'A backward-looking calculation from past option candles after estimated charges. It can reject a weak setup, but it cannot predict the next trade.',
  },
  {
    term: 'Paper trading',
    meaning:
      'Simulated orders and monitored exits. Paper fills can differ from real Groww execution, and this workflow places no live broker order.',
  },
  {
    term: 'Source confidence',
    meaning:
      'For web research, code checks that cited pages were fetched and contain the cited numbers. It does not prove each claim; uncertain points stay visible.',
  },
];

export const SAFETY_TEXT =
  'For index options, the AI proposes a direction and a premium stop and target. The platform server checks fresh Groww data, liquidity, configured limits, estimated charges and a conservative historical screen, and records HOLD if any evidence or check is missing. Only an allowed paper entry reaches the simulated F&O book.';
