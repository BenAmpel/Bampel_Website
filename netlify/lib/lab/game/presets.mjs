// CCAIR Behavioral Lab, economic games: classic games as starting points. Each preset is plain content (the same
// fields the editor shows), so everything can be changed after it is applied.
//
// Sources
//   Prisoner's dilemma: Rapoport, A., & Chammah, A. M. (1965). Prisoner's Dilemma. University of Michigan Press.
//     Payoff ordering T > R > P > S and 2R > T + S, as in Axelrod, R. (1984). The Evolution of Cooperation. Basic Books.
//   Public goods: Isaac, R. M., & Walker, J. M. (1988). Group size effects in public goods provision: the voluntary
//     contributions mechanism. Quarterly Journal of Economics, 103(1), 179-199. Four players, MPCR 0.4, ten rounds,
//     strangers matching follows the design in Fehr, E., & Gachter, S. (2000). Cooperation and punishment in public
//     goods experiments. American Economic Review, 90(4), 980-994 (without the punishment stage).
//   Trust game: Berg, J., Dickhaut, J., & McCabe, K. (1995). Trust, reciprocity, and social history. Games and
//     Economic Behavior, 10(1), 122-142. Endowment 10, amount sent is tripled.
//   Ultimatum game: Guth, W., Schmittberger, R., & Schwarze, B. (1982). An experimental analysis of ultimatum
//     bargaining. Journal of Economic Behavior & Organization, 3(4), 367-388.
//   Dictator game: Forsythe, R., Horowitz, J. L., Savin, N. E., & Sefton, M. (1994). Fairness in simple bargaining
//     experiments. Games and Economic Behavior, 6(3), 347-369.
//   Strategy method: Selten, R. (1967). Die Strategiemethode zur Erforschung des eingeschrankt rationalen Verhaltens
//     im Rahmen eines Oligopolexperiments. In H. Sauermann (Ed.), Beitrage zur experimentellen Wirtschaftsforschung.
//     Brandts, J., & Charness, G. (2011). The strategy versus the direct-response method: a first survey of
//     experimental comparisons. Experimental Economics, 14(3), 375-398.

const choice = (id, label, opts, def) => ({ id, label, kind: 'choice', options: opts.map(([value, label]) => ({ value, label })), default: def });
const number = (id, label, min, max, def, step = 1) => ({ id, label, kind: 'number', min, max, step, default: def });

const COMMON = () => ({
  conditions: [{ id: 'main', label: 'Everyone', params: {} }],
  feedback: { ownPayoff: true, othersDecisions: true, groupTotal: false, history: true },
  payment: { method: 'randomRound', pointsPerUnit: 0.1, currency: 'USD', showUpFee: 0, maxBonus: null },
  comprehension: { enabled: false, maxAttempts: 2, questions: [] }
});
const live = { mode: 'live', practiceRounds: 0, decisionSeconds: 60, waitMaxSeconds: 180, waitFallback: 'fee', timeoutAction: 'default', dropAfterTimeouts: 3, readySeconds: 45, feedbackSeconds: 30, cohortGroups: 1, pollSeconds: 2 };

export const PRESETS = {
  'prisoners-dilemma-1': {
    label: "Prisoner's dilemma, one round",
    description: 'Two players choose cooperate or defect at the same time. One round, nobody meets twice.',
    content() {
      return { ...COMMON(), minutesPerSession: 8,
        game: { ...live, players: 2, roles: [{ id: 'player', label: 'Player', count: 2 }], rounds: 1, matching: 'partners',
          stages: [{ id: 'move', label: 'Your choice', role: 'player', parallel: false, prompt: 'Choose one option. The other participant chooses at the same time.', show: [], strategyMethod: null,
            decisions: [choice('move', 'Your choice', [['C', 'Cooperate'], ['D', 'Defect']], 'C')] }] },
        params: { T: 5, R: 3, P: 1, S: 0 },
        payoff: { player: "my.move == 'C' ? (other.move == 'C' ? R : S) : (other.move == 'C' ? T : P)" },
        instructions: { general: 'You and one other participant each choose Cooperate or Defect at the same time. Your points depend on both choices, as the table shows. Points are converted to a bonus at the end.', roles: {} } };
    }
  },
  'prisoners-dilemma-10': {
    label: "Prisoner's dilemma, ten rounds with the same partner",
    description: 'The same two players meet for ten rounds and see each round\'s result.',
    content() {
      const c = PRESETS['prisoners-dilemma-1'].content();
      c.game.rounds = 10; c.game.matching = 'partners'; c.minutesPerSession = 12;
      c.instructions.general = 'You and one other participant play {rounds_text} together. In each round you each choose Cooperate or Defect at the same time. Your points depend on both choices, as the table shows. One round is chosen at random at the end, and only that round is paid.';
      return c;
    }
  },
  'public-goods': {
    label: 'Public goods game, four players, ten rounds',
    description: 'Each round every player splits an endowment between a private account and a group account. Groups are re-formed every round (strangers).',
    content() {
      return { ...COMMON(), minutesPerSession: 15,
        game: { ...live, players: 4, roles: [{ id: 'member', label: 'Group member', count: 4 }], rounds: 10, matching: 'strangers', cohortGroups: 2,
          stages: [{ id: 'contribute', label: 'Your contribution', role: 'member', parallel: false, prompt: 'How many of your {endowment} points do you put into the group account?', show: [], strategyMethod: null,
            decisions: [number('contribution', 'Points put into the group account', 0, 'endowment', 0)] }] },
        params: { endowment: 20, mpcr: 0.4 },
        payoff: { member: 'endowment - my.contribution + mpcr * (my.contribution + sum(others.contribution))' },
        feedback: { ownPayoff: true, othersDecisions: true, groupTotal: true, history: true },
        instructions: { general: 'You are in a group of four. Each round you receive {endowment} points. You choose how many to keep and how many to put into a group account. Every point in the group account earns {mpcr} points for each of the four members, whoever put it there. Your round payoff is the points you kept plus your share of the group account. The group is formed again every round, so you will not play with the same people twice in a row.', roles: {} } };
    }
  },
  'trust-live': {
    label: 'Trust game (Berg, Dickhaut, McCabe), live',
    description: 'The sender chooses how much of 10 points to send; the amount is tripled; the receiver sees it and decides how much to return.',
    content() {
      return { ...COMMON(), minutesPerSession: 10,
        game: { ...live, players: 2, roles: [{ id: 'sender', label: 'Sender', count: 1 }, { id: 'receiver', label: 'Receiver', count: 1 }], rounds: 1, matching: 'partners',
          stages: [
            { id: 'send', label: 'Amount sent', role: 'sender', parallel: false, prompt: 'How many of your {endowment} points do you send to the receiver? The amount is multiplied by {multiplier}.', show: [], strategyMethod: null,
              decisions: [number('send', 'Points sent', 0, 'endowment', 0)] },
            { id: 'return', label: 'Amount returned', role: 'receiver', parallel: false, prompt: 'The sender sent you the amount shown, which was multiplied by {multiplier}. How many points do you return?', show: ['send'], strategyMethod: null,
              decisions: [number('return', 'Points returned', 0, 'multiplier * seen.send', 0)] }] },
        params: { endowment: 10, multiplier: 3 },
        payoff: { sender: 'endowment - my.send + role.receiver.return', receiver: 'multiplier * role.sender.send - my.return' },
        instructions: { general: 'The sender starts with {endowment} points and chooses how many to send to the receiver. The amount sent is multiplied by {multiplier}. The receiver then decides how many of the points they now hold to send back. The sender keeps what they did not send and receives what is returned. The receiver keeps the rest.',
          roles: { sender: 'You are the sender. You decide first.', receiver: 'You are the receiver. You see what the sender chose, then decide.' } } };
    }
  },
  'trust-async': {
    label: 'Trust game, asynchronous with the strategy method',
    description: 'Players decide alone. The receiver states how much they would return for every possible amount sent. Each participant is then matched with a stored decision.',
    content() {
      const c = PRESETS['trust-live'].content();
      c.game.mode = 'async'; c.game.waitFallback = 'fee';
      const r = c.game.stages[1];
      r.parallel = true; r.show = []; r.prompt = 'For each amount the sender might send, say how many points you would return.';
      r.strategyMethod = { on: 'send', form: 'table', above: '', below: '', defaultThreshold: 0 };
      c.instructions.general = 'The sender starts with {endowment} points and chooses how many to send to the receiver. The amount sent is multiplied by {multiplier}. The receiver says how many of the points they would then hold they would send back, for every amount the sender might have sent. You decide on your own, without waiting for anyone. Your decision is matched with the decision of another participant who has the other role, and your points are worked out from the two.';
      c.instructions.roles = { sender: 'You are the sender. You choose how many points to send.', receiver: 'You are the receiver. For each amount the sender might send, you say how many points you would return. Only the answer for the amount actually sent counts.' };
      return c;
    }
  },
  'ultimatum-live': {
    label: 'Ultimatum game, live',
    description: 'The proposer offers a share of 10 points; the responder accepts or rejects.',
    content() {
      return { ...COMMON(), minutesPerSession: 8,
        game: { ...live, players: 2, roles: [{ id: 'proposer', label: 'Proposer', count: 1 }, { id: 'responder', label: 'Responder', count: 1 }], rounds: 1, matching: 'partners',
          stages: [
            { id: 'offer', label: 'Your offer', role: 'proposer', parallel: false, prompt: 'How many of the {pie} points do you offer to the responder? You keep the rest.', show: [], strategyMethod: null,
              decisions: [number('offer', 'Points offered', 0, 'pie', 0)] },
            { id: 'respond', label: 'Your response', role: 'responder', parallel: false, prompt: 'The proposer offered you the amount shown. Do you accept it?', show: ['offer'], strategyMethod: null,
              decisions: [choice('response', 'Your response', [['accept', 'Accept'], ['reject', 'Reject']], 'accept')] }] },
        params: { pie: 10 },
        payoff: { proposer: "role.responder.response == 'accept' ? pie - my.offer : 0", responder: "my.response == 'accept' ? role.proposer.offer : 0" },
        instructions: { general: 'The proposer divides {pie} points between themselves and the responder. If the responder accepts, both receive the proposed amounts. If the responder rejects, both receive 0.',
          roles: { proposer: 'You are the proposer. You decide first.', responder: 'You are the responder. You see the offer, then decide.' } } };
    }
  },
  'ultimatum-async': {
    label: 'Ultimatum game, asynchronous with a minimum acceptable offer',
    description: 'Players decide alone. The responder states the smallest offer they would accept. Each participant is then matched with a stored decision.',
    content() {
      const c = PRESETS['ultimatum-live'].content();
      c.game.mode = 'async'; c.game.waitFallback = 'fee';
      const r = c.game.stages[1];
      r.parallel = true; r.show = []; r.prompt = 'What is the smallest offer you would accept? Offers below it are rejected.';
      r.strategyMethod = { on: 'offer', form: 'threshold', above: 'accept', below: 'reject', defaultThreshold: 0 };
      c.instructions.general = 'The proposer divides {pie} points between themselves and the responder. If the responder accepts the offer, both receive the proposed amounts. If the responder rejects it, both receive 0. You decide on your own, without waiting for anyone. Your decision is matched with the decision of another participant who has the other role, and your points are worked out from the two. The responder states the smallest offer they would accept: any offer at or above it is accepted, any offer below it is rejected.';
      c.instructions.roles = { proposer: 'You are the proposer. You choose how much to offer.', responder: 'You are the responder. You state the smallest offer you would accept.' };
      return c;
    }
  },
  'dictator': {
    label: 'Dictator game',
    description: 'The dictator splits 10 points. The recipient does not decide anything.',
    content() {
      return { ...COMMON(), minutesPerSession: 6,
        game: { ...live, players: 2, roles: [{ id: 'dictator', label: 'Dictator', count: 1 }, { id: 'recipient', label: 'Recipient', count: 1 }], rounds: 1, matching: 'partners',
          stages: [{ id: 'allocate', label: 'Your allocation', role: 'dictator', parallel: false, prompt: 'How many of the {endowment} points do you give to the other participant? You keep the rest.', show: [], strategyMethod: null,
            decisions: [number('give', 'Points given', 0, 'endowment', 0)] }] },
        params: { endowment: 10 },
        payoff: { dictator: 'endowment - my.give', recipient: 'role.dictator.give' },
        feedback: { ownPayoff: true, othersDecisions: true, groupTotal: false, history: false },
        instructions: { general: 'The dictator divides {endowment} points between themselves and the recipient. The recipient makes no decision and receives what the dictator gives.',
          roles: { dictator: 'You are the dictator. You decide how to divide the points.', recipient: 'You are the recipient. You make no decision; you receive what the dictator gives.' } } };
    }
  }
};
export const presetList = () => Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, description: p.description }));
export const presetContent = id => (PRESETS[id] ? PRESETS[id].content() : null);
