import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class StudyErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('StudyErrorBoundary caught an error:', error, errorInfo);
  }

  public handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 bg-slate-50/50 rounded-3xl border border-slate-200/60 my-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-4 shadow-xl border border-slate-200">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900">Something went wrong loading Study</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                {this.state.error?.message || 'An unexpected error occurred in the study timer section.'}
              </p>
            </div>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#6750A4] hover:bg-[#503E84] text-white text-xs font-bold rounded-full transition-colors cursor-pointer shadow-md"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
