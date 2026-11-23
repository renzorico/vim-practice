import { PALETTE, type PixelSprite } from './sprite.js';

/** Authored 16px field silhouettes. Existing animation counts are preserved. */
export const CHARACTER_FIELDS = {
  'elder': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    ".....wwwwww.....",
    ".....wssssw.....",
    ".....wksksw.....",
    ".....wssssw.....",
    ".....wwwwww..tt.",
    ".....gwwwwgg..t.",
    ".....ggggggg..t.",
    ".....ggggggg..t.",
    ".....ggggggg..t.",
    ".....ggggggg..t.",
    ".....kkk.kkk..t.",
    "..............t."
  ]
] },
  'mira': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    ".....rrrrrr.....",
    "....rrssssrr....",
    "....rrksksrr....",
    "....rrssssrrTTT.",
    "....rrssssrT...T",
    "....rCCCCCCCCCCC",
    "....rCCCCCCCcccC",
    "....CCCCCCCCCCC.",
    "....CCCCCCCC....",
    "....kkk..kkk....",
    "................"
  ]
] },
  'dot': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "......kkkk......",
    ".....kkkkkk.....",
    "....kkwwwwkk....",
    "....kkwkwkwk....",
    "....kkkkkkkk....",
    ".....kkkkkk.....",
    "......kkkk......",
    "................",
    "................"
  ]
] },
  'ash': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "....yyyyyyyy....",
    ".....TssssT.....",
    ".....TksksT.....",
    ".....TssssT.....",
    ".....TssssT.....",
    "...tttttttttbbbb",
    "...ttttttttbbb..",
    "...ttttttttttT..",
    "...ttttttttttT..",
    "...ttttttttttT..",
    "...ttttttttttT..",
    "...kkk....kkk...",
    "................"
  ]
] },
  'wren': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    ".......TTT......",
    ".......TTT......",
    ".....TTTTTT.....",
    ".....TssssT.....",
    ".....TksksT.TT..",
    ".....TssssT.TT..",
    ".....TssssT.TTTT",
    ".....rrrrrrkkkkk",
    ".....rrrrrr.....",
    ".....rrrrrr.....",
    ".....kkkkkk.....",
    "................"
  ]
] },
  'echo': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    ".....CCCCCC.....",
    "....CCssssCC....",
    "....CCksksCC....",
    "....CCssssCC....",
    "....CCssssCC....",
    "....CCCCCCCC....",
    "....CCCCCCCC.c..",
    ".....CCCCCCCcwc.",
    ".....CCCCCCccwCC",
    ".....CCCCCCCCCC.",
    ".....CCCCCCC.C..",
    ".....CCCCCCC....",
    ".....kkk.kkk....",
    "................"
  ]
] },
  'lamplighter': { palette: PALETTE, frames: [
  [
    "................",
    ".....wwwww......",
    "...wwwwwwwww....",
    ".....wssssw.....",
    ".....wksksw.....",
    ".....wssssw.....",
    ".....wssssw.....",
    ".....bbbbbb.....",
    ".....bbbbbb..T..",
    ".....bbbbbb.TTT.",
    ".....bbbbbb.ywy.",
    ".....bbbbbb.yyy.",
    ".....bbbbbb.TTT.",
    ".....bbbbbb..T..",
    ".....kkkkkk.....",
    "................"
  ]
] },
  'mason': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "....TTTTTTTT....",
    ".....TssssT.....",
    ".....TksksT.....",
    ".....TssssT.....",
    ".....TssssT..b..",
    "...wwwwwwwwwbbb.",
    "...wwwwwwwwbbbbb",
    "...wwwwwwwwwwT..",
    "...wwwwwwwwwwT..",
    "...wwwwwwwwwww..",
    "...kkk.....kkk..",
    "................"
  ]
] },
  'shut': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    "....wwwwwwww....",
    "....wwwwwwww....",
    ".....wksksw.....",
    "yyyyywssssw.....",
    "y...ywssssw.....",
    "y..CyCCCCCCCC...",
    "yyyyyCCCCCCCC...",
    "..TCCCCCCCCCC...",
    "...CCCCCCCCCC...",
    "...kkk....kkk...",
    "................"
  ]
] },
  'ope': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "....wwwww.......",
    ".....wwwwww.....",
    ".....wssssw.....",
    ".....wksksw.....",
    ".....wssssw.....",
    ".....wssssw.....",
    ".....cccccc..y..",
    ".....cccccc.y...",
    ".....ccccccy....",
    ".....cccccc.y...",
    ".....cccccc..y..",
    ".....cccccc.....",
    ".....kkkkkk.....",
    "................"
  ]
] },
  'tare': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....TTTTTTTT....",
    ".....TssssT.....",
    ".....TksksT..T..",
    ".....TssssTTTTTT",
    ".....TssssTT.T.T",
    "...GGGGGGGGyGT.y",
    "...GGGGGGGGGGT..",
    "...GGGGGGGGGGG..",
    "...kkk.....kkk..",
    "................"
  ]
] },
  'ream': { palette: PALETTE, frames: [
  [
    ".......rrr......",
    ".......rrr......",
    ".....rrrrrr.....",
    ".....rssssr.....",
    ".....rksksr.....",
    ".....rssssr.....",
    ".....rssssr.....",
    "....bbbbbbbb....",
    "....bbbbbbbwwww.",
    "....bbbbbbbwbbw.",
    "....bbbbbbbwwww.",
    "....bbbbbbbwbbw.",
    "....bbbbbbbwwww.",
    "....bbbbbbbb....",
    "....kkk..kkk....",
    "................"
  ]
] },
  'bitt': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".....TTTTTT.....",
    ".....TssssT.....",
    ".ttt.TksksT.....",
    "t...tTssssT.....",
    "t.t.tTssssT.....",
    ".tttCCCCCCCCCC..",
    "..CtCCCCCCCCCC..",
    "..CCCCCCCCCCCC..",
    "..kkk......kkk..",
    "................"
  ]
] },
  'index': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    ".....wwwwww.....",
    ".....wssssw.....",
    ".....kwkkwk.....",
    ".....wssssw.....",
    ".....wssssw.....",
    ".....RRRRRRR.www",
    ".....RRRRRRRwwwb",
    ".....RRRRRRwwwbw",
    ".....RRRRRRwbwww",
    ".....RRRRRRwwww.",
    ".....RRRRRRR....",
    ".....kkk.kkk....",
    "................"
  ]
] },
  'quire': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    ".....TTTTTT.....",
    "....TTssssTT....",
    "....TTksksTT....",
    "....TTssssTTwwwT",
    "....TTssssTTbb.T",
    "....TggggggTwwwT",
    "....TggggggTTTTT",
    "....gggggggg....",
    "....gggggggg....",
    "....kkk..kkk....",
    "................"
  ]
] },
  'folio': { palette: PALETTE, frames: [
  [
    ".......www......",
    ".......www......",
    ".....wwwwww.....",
    ".....wssssw.....",
    ".....wksksw.....",
    ".....wssssw.....",
    ".....wssssw.....",
    "....bbbbbbbbb...",
    "....bbbbbbbTwwwT",
    "....bbbbbbbbwbw.",
    "....bbbbbbbbwww.",
    "....bbbbbbbTwwwT",
    "....bbbbbbbbb...",
    "....bbbbbbbbb...",
    "....kkk...kkk...",
    "................"
  ]
] },
  'notary': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    ".....kkkkkk.....",
    ".....kssssk.....",
    ".....kksksk.....",
    ".....kssssk.....",
    ".....kssssk.....",
    "....wwwwwwww.r..",
    "....RRRRRRRRrrr.",
    "....RRRRRRRR.T..",
    "....RRRRRRRRTTT.",
    "....RRRRRRRR....",
    "....RRRRRRRR....",
    "....kkk..kkk....",
    "................"
  ]
] },
  'pilcrow': { palette: PALETTE, frames: [
  [
    ".......ggg......",
    ".......ggg......",
    ".....gggggg.....",
    ".....gssssg.....",
    ".....gksksg.....",
    ".....gssssg.....",
    ".....gssssg.....",
    ".....GGGGGG.....",
    ".....GGGGGG.ttt.",
    ".....GGGGGGt...t",
    ".....GGGGGGt....",
    ".....GGGGGGt....",
    ".....GGGGGGt....",
    ".....GGGGGGt....",
    ".....kkkkkkt....",
    "................"
  ]
] },
  'fern': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    ".....TTTTTT.....",
    ".....TssssT.....",
    ".....TksksTTT...",
    ".....TssssTTTa..",
    ".....TssssTaTa.a",
    ".....aaaaaaTaaa.",
    ".....aaaaaaa.a.a",
    ".....aaaaaaa.T..",
    ".....aaaaaaa....",
    ".....kkk.kkk....",
    "................"
  ]
] },
  'semi': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    ".....rrrrr......",
    "...rrrrrrrrr....",
    ".....rssssr.....",
    ".....rksksr.....",
    ".....rssssr.....",
    ".....rssssrTrrr.",
    "....GGGGGGGTrrr.",
    "....GGGGGGGT....",
    "....GGGGGGGT....",
    "....GGGGGGGT....",
    "....GGGGGGGG....",
    "....kkk..kkk....",
    "................"
  ]
] },
  'gull': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    ".....wwwww......",
    "...wwwwwwwww....",
    ".....wssssw.....",
    ".....wksksw.....",
    ".....wssssw.....",
    ".TTT.wssssw.....",
    "T.b.TCCCCCCC....",
    ".b.b.CCCCCCC....",
    "..T..CCCCCCC....",
    "..T..CCCCCCC....",
    ".....CCCCCCC....",
    ".....kkk.kkk....",
    "................"
  ]
] },
  'kit': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....yyyyyyyy....",
    ".....TssssTbbbbb",
    ".....TksksT.bbb.",
    ".....TssssT..T..",
    ".....TssssT..T..",
    ".....gggggg.....",
    ".....gggggg.....",
    ".....kkkkkk.....",
    "................"
  ]
] },
  'bram': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    ".....TTTTTT.....",
    ".....TssssT.....",
    ".....TksksT.....",
    ".....TssssT.....",
    "t...tTTTTTT.....",
    ".tttrrTTTTrrrr..",
    "twtwtrrrrrrrrr..",
    "tttttrrrrrrrrr..",
    "..rrrrrrrrrrrr..",
    "..rrrrrrrrrrrr..",
    "..kkk......kkk..",
    "................"
  ]
] },
  'pell': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    ".....wwwwww.....",
    "....wwssssww....",
    "....wwksksww....",
    "....wwsssswwyyy.",
    "....wwsssswywywy",
    "....waaaaaayyyyy",
    "....waaaaaawttt.",
    "....aaaaaaaaa...",
    "....aaaaaaaaa...",
    "....kkk...kkk...",
    "................"
  ]
] },
  'cleat': { palette: PALETTE, frames: [
  [
    "................",
    ".....TTTTT......",
    "...TTTTTTTTT....",
    ".....TssssT.....",
    ".....TksksT.....",
    ".....TssssT.....",
    ".....TssssT.....",
    "...bbbbbbbbbb...",
    "..bbbbbbbbbbb...",
    ".bbbbbbbbbbbb...",
    "..bbbbbbbbbbb...",
    "b.bbbbbbbbbbb...",
    ".bbbbbbbbbbbb...",
    "...bbbbbbbbbb...",
    "...kkk....kkk...",
    "................"
  ]
] },
  'player': { palette: PALETTE, frames: [
  [
    "................",
    "................",
    "................",
    "................",
    ".......TTT......",
    ".......TTT......",
    ".....TTTTTT.....",
    ".....TssssT.....",
    ".....TksksTyyyy.",
    ".....TssssT..yyy",
    ".....TssssT....y",
    "....yyyyyyyy....",
    ".....GGGGGyyyy..",
    ".....GGGGGG.yy..",
    ".....kkkkkk.....",
    "................"
  ],
  [
    "................",
    "................",
    "................",
    "................",
    ".......TTT......",
    ".......TTT......",
    ".....TTTTTT.....",
    ".....TssssT.....",
    ".....Tksksy..yy.",
    ".....TssssTyy..y",
    ".....TssssT.....",
    "....yyyyyy......",
    ".....GGGGGyyyy..",
    ".....GGGGGG.yy..",
    ".....kkkkkk.....",
    "................"
  ]
] },
} satisfies Readonly<Record<string, PixelSprite>>;
