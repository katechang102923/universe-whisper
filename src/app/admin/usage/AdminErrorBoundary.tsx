"use client";

import React from "react";

/**
 * 後台區塊錯誤邊界：隔離單一後台客戶端元件（統計、補發、通行碼…）的執行期錯誤，
 * 避免某個區塊壞掉就讓整個後台白屏或無法點擊。錯誤只影響該區塊，其餘導覽與功能照常。
 */
export class AdminErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; label?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[admin] section crashed${this.props.label ? ` (${this.props.label})` : ""}:`, error);
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-red-400/25 bg-red-400/8 p-5 text-sm text-red-200">
          <p className="font-semibold">資料讀取失敗，請稍後重試</p>
          <p className="mt-1 text-xs leading-6 text-red-200/70">
            {this.props.label ? `（${this.props.label}）` : ""}此區塊發生錯誤，但後台其他功能仍可正常使用。
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 rounded-full border border-white/20 bg-white/8 px-4 py-1.5 text-xs text-moon transition hover:bg-white/14"
          >
            重試此區塊
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
