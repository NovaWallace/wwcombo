WWCOMBO DLC 扩展说明 / Extension Guide

基础版不再内置 FFmpeg、模拟演示执行器和 Live2D 源素材。未安装 DLC 时，普通录制、练习、连段编辑、导入导出 JSON、外观设置等功能仍可正常使用。

扩展目录与 wwcombo.exe 位于同一路径：

wwcombo.exe
wwcombo dlc\
  ffmpeg\
    ffmpeg.exe
  simulated-input\
    simulated-input-dlc.exe
  live2d\
    角色名-ID\
      manifest.json
      assets\...

安装方式：将所需 DLC 压缩包直接解压到 wwcombo.exe 所在目录。可以只安装视频扩展、模拟演示扩展，或只挑一个喜欢的 Live2D 角色。打开软件后前往“设置 > wwcombo DLC”点击“刷新”。

FFmpeg 扩展提供视频识别、视频合成和 MP4 导出。
模拟演示扩展提供测试连段时的键盘和鼠标模拟输入；未安装时不会显示模拟演示入口。
每个 Live2D 角色都是独立包，只在主页显示时加载，离开主页后释放。

The core build no longer bundles FFmpeg, the native simulation-demo executor, or Live2D source assets. Recording, practice, combo editing, JSON import/export, and appearance settings continue to work without DLC.

Install only the packages you need by extracting them beside wwcombo.exe. Then open Settings > wwcombo DLC and choose Refresh. Simulation Demo becomes available after its DLC is detected.
