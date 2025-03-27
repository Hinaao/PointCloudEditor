declare module 'three/examples/jsm/loaders/PCDLoader' {
    import { Object3D, LoadingManager } from 'three';
  
    export class PCDLoader {
      constructor(manager?: LoadingManager);
      load(url: string, onLoad: (points: Object3D) => void, onProgress?: (event: ProgressEvent) => void, onError?: (event: ErrorEvent) => void): void;
      parse(data: ArrayBuffer | string): Object3D;
      parseAsync(data: ArrayBuffer | string): Promise<Object3D>;
    }
  }