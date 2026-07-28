import { useEffect, useRef, useState } from 'react';

type LoadState = 'loading' | 'ready' | 'error';

type HomeSpineStageProps = {
  skeletonUrl: string;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  active?: boolean;
};

export function HomeSpineStage({ skeletonUrl, scale = 2, offsetX = 0, offsetY = 0, active = true }: HomeSpineStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<import('pixi.js').Application | null>(null);
  const activeRef = useRef(active);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  activeRef.current = active;

  useEffect(() => {
    const updatePlayback = () => {
      const application = applicationRef.current;
      if (!application) return;
      if (active && !document.hidden) application.start();
      else application.stop();
    };

    document.addEventListener('visibilitychange', updatePlayback);
    updatePlayback();
    return () => document.removeEventListener('visibilitychange', updatePlayback);
  }, [active]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stageHost: HTMLDivElement = host;

    setLoadState('loading');
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let application: import('pixi.js').Application | null = null;
    let assets: typeof import('pixi.js').Assets | null = null;
    let assetLoaded = false;

    const releaseAsset = () => {
      if (!assets || !assetLoaded) return;
      assetLoaded = false;
      void assets.unload(skeletonUrl).catch(() => undefined);
    };

    async function initialize() {
      const [{ Application, Assets }, { Spine }] = await Promise.all([
        import('pixi.js'),
        import('pixi-spine')
      ]);
      if (disposed) return;
      assets = Assets;

      const nextApplication = new Application({
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
        powerPreference: 'high-performance',
        resolution: Math.min(window.devicePixelRatio || 1, 1.5)
      });
      nextApplication.ticker.maxFPS = 45;
      application = nextApplication;
      applicationRef.current = nextApplication;
      const canvas = nextApplication.view as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.tabIndex = -1;
      stageHost.replaceChildren(canvas);

      type SpineResource = { spineData?: ConstructorParameters<typeof Spine>[0] };
      const resource = await Assets.load(skeletonUrl) as SpineResource;
      assetLoaded = true;
      if (disposed) {
        releaseAsset();
        return;
      }
      if (!resource.spineData) throw new Error('The home Spine resource did not include skeleton data.');

      const model = new Spine(resource.spineData);
      const animations = resource.spineData.animations;
      const animation = animations.find((item) => /idle|loop|stand|wait|animation/i.test(item.name)) ?? animations[0];
      if (animation) model.state.setAnimation(0, animation.name, true);
      model.autoUpdate = true;
      nextApplication.stage.addChild(model);

      const bounds = model.getLocalBounds();
      const fitModel = () => {
        const width = Math.max(1, stageHost.clientWidth);
        const height = Math.max(1, stageHost.clientHeight);
        nextApplication.renderer.resize(width, height);
        if (bounds.width <= 0 || bounds.height <= 0) return;

        const fittedScale = Math.min(width / bounds.width, height / bounds.height) * scale;
        model.scale.set(fittedScale);
        model.position.set(
          width * (0.5 + offsetX) - (bounds.x + bounds.width / 2) * fittedScale,
          height * (0.5 + offsetY) - (bounds.y + bounds.height / 2) * fittedScale
        );
      };

      resizeObserver = new ResizeObserver(fitModel);
      resizeObserver.observe(stageHost);
      fitModel();

      if (!activeRef.current || document.hidden) nextApplication.stop();

      stageHost.dataset.animation = animation?.name ?? '';
      setLoadState('ready');
    }

    void initialize().catch((error: unknown) => {
      if (disposed) return;
      console.error('Unable to load the home Spine animation.', error);
      application?.destroy(true, { children: true, texture: false, baseTexture: false });
      releaseAsset();
      if (applicationRef.current === application) applicationRef.current = null;
      application = null;
      stageHost.replaceChildren();
      setLoadState('error');
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      application?.destroy(true, { children: true, texture: false, baseTexture: false });
      releaseAsset();
      if (applicationRef.current === application) applicationRef.current = null;
      stageHost.replaceChildren();
    };
  }, [offsetX, offsetY, scale, skeletonUrl]);

  return (
    <div className={`home-spine-frame ${loadState}`}>
      <div ref={hostRef} className="home-spine-canvas" />
    </div>
  );
}
