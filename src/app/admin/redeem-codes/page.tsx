import { redirect } from "next/navigation";

// 重新導向至統一後台的通行碼管理分頁
export default function AdminRedeemCodesPage() {
  redirect("/admin/usage?tab=redeem");
}
