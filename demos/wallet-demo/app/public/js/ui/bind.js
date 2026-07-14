/**
 * Bind DOM controls → WalletService.
 */

import { $, readForm } from "./render.js";

/**
 * @param {import("../domain/service.js").WalletService} service
 * @param {{ onPing: () => Promise<void> }} live
 */
export function bindControls(service, live) {
  $("btn-ping").onclick = () => live.onPing();

  $("btn-open").onclick = () => {
    const f = readForm(["openId", "openOwner"]);
    service.openWallet(f.openId, f.openOwner.trim());
  };

  $("btn-fund").onclick = () => {
    const f = readForm(["fundId", "fundAmt", "fundRef"]);
    service.fundWallet(f.fundId, f.fundAmt, f.fundRef.trim());
  };

  $("btn-withdraw").onclick = () => {
    const f = readForm(["wdId", "wdAmt", "wdRef"]);
    service.withdrawWallet(f.wdId, f.wdAmt, f.wdRef.trim());
  };

  $("btn-transfer").onclick = () => {
    const f = readForm(["txFrom", "txTo", "txAmt"]);
    service.transfer(f.txFrom, f.txTo, f.txAmt);
  };
}
