import { useEffect, useRef, useState } from 'react';

type LoadState = 'loading' | 'ready' | 'error';

type HomeSpineStageProps = {
  skeletonUrl: string;
  atlasUrl: string;
  textureUrl: string;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  shiftX?: number;
  active?: boolean;
};

function relatedSpineAssetUrls(skeletonUrl: string, atlasUrl: string, textureUrl: string): string[] {
  return [skeletonUrl, atlasUrl, textureUrl];
}

export function HomeSpineStage({ skeletonUrl, atlasUrl, textureUrl, scale = 2, offsetX = 0, offsetY = 0, shiftX = 0, active = true }: HomeSpineStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<import('pixi.js').Application | null>(null);
  const activeRef = useRef(active);
  const shiftXRef = useRef(shiftX);
  const scaleRef = useRef(scale);
  const offsetXRef = useRef(offsetX);
  const offsetYRef = useRef(offsetY);
  const fitModelRef = useRef<(() => void) | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  activeRef.current = active;
  shiftXRef.current = shiftX;
  scaleRef.current = scale;
  offsetXRef.current = offsetX;
  offsetYRef.current = offsetY;

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
      if (!assets) return;
      assetLoaded = false;
      const loadedAssets = assets;
      void (async () => {
        for (const url of relatedSpineAssetUrls(skeletonUrl, atlasUrl, textureUrl)) await loadedAssets.unload(url).catch(() => undefined);
      })();
    };

    async function initialize() {
      const [{ Application, Assets }, { Spine }] = await Promise.all([
        import('pixi.js'),
        import('pixi-spine')
      ]);
      if (disposed) return;
      assets = Assets;

      const nextApplication = new Application({
        antialias: false,
        autoDensity: true,
        backgroundAlpha: 0,
        powerPreference: 'low-power',
        resolution: 1
      });
      nextApplication.ticker.maxFPS = 30;
      application = nextApplication;
      applicationRef.current = nextApplication;
      const canvas = nextApplication.view as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.tabIndex = -1;
      stageHost.replaceChildren(canvas);

      type SpineResource = { spineData?: ConstructorParameters<typeof Spine>[0] };
      const resource = await Assets.load({
        src: skeletonUrl,
        data: {
          spineAtlasFile: atlasUrl
        }
      }) as SpineResource;
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
      let modelBaseX = 0;
      let modelViewportWidth = 1;
      let renderedShiftX = shiftXRef.current;
      const updateShift = (delta: number) => {
        const targetShiftX = shiftXRef.current;
        const blend = 1 - Math.pow(0.76, Math.max(0.1, delta));
        renderedShiftX += (targetShiftX - renderedShiftX) * blend;
        if (Math.abs(targetShiftX - renderedShiftX) < 0.0001) renderedShiftX = targetShiftX;
        model.x = modelBaseX + modelViewportWidth * renderedShiftX;
      };
      nextApplication.ticker.add(updateShift);
      const fitModel = () => {
        const width = Math.max(1, stageHost.clientWidth);
        const height = Math.max(1, stageHost.clientHeight);
        nextApplication.renderer.resize(width, height);
        if (bounds.width <= 0 || bounds.height <= 0) return;

        const fittedScale = Math.min(width / bounds.width, height / bounds.height) * scaleRef.current;
        model.scale.set(fittedScale);
        modelBaseX = width * (0.5 + offsetXRef.current) - (bounds.x + bounds.width / 2) * fittedScale;
        modelViewportWidth = width;
        model.position.set(
          modelBaseX + width * renderedShiftX,
          height * (0.5 + offsetYRef.current) - (bounds.y + bounds.height / 2) * fittedScale
        );
      };
      fitModelRef.current = fitModel;

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
      fitModelRef.current = null;
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
      fitModelRef.current = null;
      stageHost.replaceChildren();
    };
  }, [atlasUrl, skeletonUrl, textureUrl]);

  useEffect(() => {
    fitModelRef.current?.();
  }, [scale, offsetX, offsetY]);

  return (
    <div className={`home-spine-frame ${loadState}`}>
      <div ref={hostRef} className="home-spine-canvas" />
    </div>
  );
}
