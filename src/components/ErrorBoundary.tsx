import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let readable = 'حدث خطأ غير متوقع في التطبيق.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed.error) {
        if (parsed.error.includes('permission') || parsed.error.includes('insufficient')) {
          readable = 'ليست لديك صلاحية لتنفيذ هذه العملية.';
        } else {
          readable = parsed.error;
        }
      }
    } catch {
      if (error.message) {
        readable = error.message;
      }
    }
    return { hasError: true, message: readable };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-[#E5E2D9] rounded-2xl p-6 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-[#1A2421] mb-2">تعذّر إكمال العملية</h1>
            <p className="text-sm text-[#4A5552] leading-relaxed mb-6">{this.state.message}</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full h-12 rounded-xl bg-[#0F4C3A] text-white font-semibold flex items-center justify-center gap-2 hover:bg-[#0B3A2C] active:scale-[0.99] transition"
            >
              <RotateCw className="w-4 h-4" />
              <span>إعادة تحميل التطبيق</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
