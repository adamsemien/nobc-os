declare module 'justified-layout' {
  export interface JLBox {
    top: number;
    left: number;
    width: number;
    height: number;
    aspectRatio?: number;
  }
  export interface JLResult {
    containerHeight: number;
    widowCount: number;
    boxes: JLBox[];
  }
  export interface JLConfig {
    containerWidth?: number;
    containerPadding?: number;
    boxSpacing?: number;
    targetRowHeight?: number;
    targetRowHeightTolerance?: number;
    maxNumRows?: number;
    forceAspectRatio?: boolean | number;
    showWidows?: boolean;
    fullWidthBreakoutRowCadence?: boolean | number;
  }
  export default function justifiedLayout(
    input: Array<{ width: number; height: number }> | number[],
    config?: JLConfig,
  ): JLResult;
}
