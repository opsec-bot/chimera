declare module 'recharts' {
  // Fallback minimal declarations to satisfy TypeScript in this project setup
  import * as React from 'react';
  export const ResponsiveContainer: React.FC<any>;
  export const AreaChart: React.FC<any>;
  export const Area: React.FC<any>;
  export const XAxis: React.FC<any>;
  export const YAxis: React.FC<any>;
  export const Tooltip: React.FC<any>;
  export const CartesianGrid: React.FC<any>;
  export const Line: React.FC<any>;
  export const Legend: React.FC<any>;
}
