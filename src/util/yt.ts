import { YT_APP_SELECTOR, YT_PLAYER_SELECTOR } from './consts';

export default class YTUtil {
  /**
   * Get the YTApp
   */
  public static getApp(): YTApp {
    const a: any = $(YT_APP_SELECTOR).get(0);
    return a;
  }

  /**
   * Get the YT Player
   */
  public static getPlayer(): YT.Player | null {
    const p: any = $(YT_PLAYER_SELECTOR).get(0);
    return p !== undefined && p !== null ? p.getPlayer() as YT.Player : null;
  }
}