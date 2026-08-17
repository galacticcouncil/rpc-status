// kind: 'gateway' = subway cache-proxy or LB (what integrators actually dial),
// 'node' = the substrate node behind it.
export default [
  { url: 'https://rpc.hydradx.cloud', name: 'GC', location: '?', kind: 'gateway' },
  {
    url: 'https://hydration-rpc.n.dwellir.com',
    name: 'Dwellir',
    location: '?',
    kind: 'gateway',
  },
  { url: 'https://rpc.helikon.io/hydradx', name: 'Helicon', location: '?', kind: 'gateway' },
  { url: 'https://hydration.dotters.network', name: 'Dotters', location: '?', kind: 'gateway' },
  { url: 'https://hydration.ibp.network', name: 'IBP', location: '?', kind: 'gateway' },
  { url: 'https://hydration.rpc.stkd.io', name: 'stkd', location: 'BR', kind: 'gateway' },
  { url: 'https://hydration.rotko.net', name: 'rotko', location: 'SEA', kind: 'gateway' },

  // fleet gateways — the endpoints hydration-ui ships in its provider list
  { url: 'https://subway.coke.hydration.cloud', name: 'coke', location: 'SG', kind: 'gateway' },
  { url: 'https://subway.sin.hydration.cloud', name: 'sin', location: 'SG', kind: 'gateway' },
  { url: 'https://rpc.kril.hydration.cloud', name: 'kril', location: '?', kind: 'gateway' },
  {
    url: 'https://subway.shellfish.hydration.cloud',
    name: 'shellfish',
    location: '?',
    kind: 'gateway',
  },
  {
    url: 'https://rpc-catfish-1.catfish.hydration.cloud',
    name: 'catfish1',
    location: '?',
    kind: 'gateway',
  },
  {
    url: 'https://rpc-catfish-2.catfish.hydration.cloud',
    name: 'catfish2',
    location: '?',
    kind: 'gateway',
  },
  {
    url: 'https://rpc-catfish-3.catfish.hydration.cloud',
    name: 'catfish3',
    location: '?',
    kind: 'gateway',
  },
  {
    url: 'https://rpc-catfish-4.catfish.hydration.cloud',
    name: 'catfish4',
    location: '?',
    kind: 'gateway',
  },

  // direct nodes
  { url: 'https://rpc.sin.hydration.cloud', name: 'sin (node)', location: 'SG', kind: 'node' },
  { url: 'https://rpc.coke.hydration.cloud', name: 'coke (node)', location: 'SG', kind: 'node' },
  { url: 'https://hdx.tarn.hydration.cloud', name: 'tarn', location: '?', kind: 'node' },
  {
    url: 'https://node-dir.kril.hydration.cloud',
    name: 'kril (node)',
    location: '?',
    kind: 'node',
  },
  {
    url: 'https://node-catfish-1.catfish.hydration.cloud',
    name: 'catfish1 (node)',
    location: '?',
    kind: 'node',
  },
  {
    url: 'https://node-catfish-2.catfish.hydration.cloud',
    name: 'catfish2 (node)',
    location: '?',
    kind: 'node',
  },
  {
    url: 'https://node-catfish-3.catfish.hydration.cloud',
    name: 'catfish3 (node)',
    location: '?',
    kind: 'node',
  },
  {
    url: 'https://node-catfish-4.catfish.hydration.cloud',
    name: 'catfish4 (node)',
    location: '?',
    kind: 'node',
  },
  {
    url: 'https://node-catfish-5.catfish.hydration.cloud',
    name: 'catfish5 (node)',
    location: '?',
    kind: 'node',
  },

  // testnets
  {
    url: 'https://node.lark.hydration.cloud',
    name: 'lark1',
    location: '?',
    kind: 'node',
    testnet: true,
  },
  {
    url: 'https://node2.lark.hydration.cloud',
    name: 'lark2',
    location: '?',
    kind: 'node',
    testnet: true,
  },
  {
    url: 'https://node3.lark.hydration.cloud',
    name: 'lark3',
    location: '?',
    kind: 'node',
    testnet: true,
  },
  {
    url: 'https://node4.lark.hydration.cloud',
    name: 'lark4',
    location: '?',
    kind: 'node',
    testnet: true,
  },
  {
    url: 'https://node5.lark.hydration.cloud',
    name: 'lark5',
    location: '?',
    kind: 'node',
    testnet: true,
  },
  {
    url: 'https://paseo-rpc.play.hydration.cloud',
    name: 'paseo',
    location: '?',
    kind: 'node',
    testnet: true,
  },
];
