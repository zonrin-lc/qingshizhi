/**
 * 视觉常量:直接对齐 H5 的 CSS 变量(styles/base.css),避免两套色板漂移。
 * 设计稿基准 1280×720,横屏。
 */

export const DESIGN_W = 1280;
export const DESIGN_H = 720;

export const COLOR = {
  app: '#f2ead8',
  paper: '#f6efe0',
  paperCard: '#faf5e9',
  paperCardSel: '#fffcf2',

  inkHeavy: '#1a1612',
  inkStrong: '#2a251d',
  ink: '#3e372c',
  inkSoft: '#605646',
  inkDim: '#847864',

  zhu: '#b0432f',
  zhuHi: '#9e3422',
  gold: '#8a6a34',
  goldHi: '#c4a05a',
  qing: '#467069',
  good: '#567444',

  line: '#c6b492',
  lineSoft: '#d6c8ae',
} as const;

/** 正文卷轴内的排版参数(与 H5 阅读区等宽) */
export const TEXT = {
  /** 正文起点(设计坐标) */
  x: 132,
  y: 206,
  w: 616,
  h: 292,
  fontSize: 26,
  lineHeight: 41,
  /** 段间额外间距 */
  paraGap: 10,
} as const;

/** 卷轴面板矩形 */
export const PANEL = { x: 60, y: 92, w: 760, h: 456 } as const;

/** 三张选项卡的矩形(设计坐标) */
export const CARD_W = 240;
export const CARD_H = 112;
export const CARD_Y = 570;
export const CARD_X0 = 60;
export const CARD_GAP = 260;
