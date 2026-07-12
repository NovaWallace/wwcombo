import React from 'react';

const STORAGE_KEY = 'ww-combo-trainer-state-v2';

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('应用界面渲染失败', error, info);
  }

  clearState = () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <div className="crash-panel">
          <h1>界面加载失败</h1>
          <p>通常是导入的图片或本地配置异常导致。可以先清理本地配置恢复启动，再重新导入压缩后的图片。</p>
          <pre>{this.state.error.message}</pre>
          <div>
            <button className="primary" onClick={this.clearState}>清理本地配置并重启</button>
            <button onClick={() => location.reload()}>重新加载</button>
          </div>
        </div>
      </div>
    );
  }
}
