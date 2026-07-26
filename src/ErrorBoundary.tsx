import React from 'react';
import { isAppLanguage, localizeEnglish } from './i18n';

const STORAGE_KEY = 'ww-combo-trainer-state-v2';
const LANGUAGE_STORAGE_KEY = 'ww-combo-trainer-language-v1';

function errorText(chinese: string, english: string): string {
  try {
    const language = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (!isAppLanguage(language) || language === 'zh-CN') return chinese;
    return localizeEnglish(english, language);
  } catch {
    return chinese;
  }
}

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
          <h1>{errorText('界面加载失败', 'Unable to Load the Interface')}</h1>
          <p>{errorText('通常是导入的图片或本地配置异常导致。可以先清理本地配置恢复启动，再重新导入压缩后的图片。', 'This is usually caused by an imported image or invalid local settings. Clear local settings to restore startup, then import a compressed image again.')}</p>
          <pre>{this.state.error.message}</pre>
          <div>
            <button className="primary" onClick={this.clearState}>{errorText('清理本地配置并重启', 'Clear Local Settings and Restart')}</button>
            <button onClick={() => location.reload()}>{errorText('重新加载', 'Reload')}</button>
          </div>
        </div>
      </div>
    );
  }
}
