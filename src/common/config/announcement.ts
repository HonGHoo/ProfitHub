/**
 * 公告配置
 * 用于在页面顶部展示全局公告信息
 */

export interface AnnouncementConfig {
  /** 是否启用公告 */
  enabled: boolean
  /** 公告唯一标识，用于localStorage记录关闭状态，修改id可让已关闭的用户重新看到公告 */
  id: string
  /** 公告消息的i18n key */
  message: {
    title: string
    content: string
  }
  /** 相关链接 */
  link?: {
    url: string
    text: string
  }
}

export const announcementConfig: AnnouncementConfig = {
  enabled: true,
  id: "v2.8.1-fixes",
  message: {
    title: "v2.8.1 修复公告",
    content: [
      "一、修复（重要）",
      "1. 强化分解/超级强化：换配装数据锁死与页面崩溃修复；两页首轮计算均改为分片进行并显示进度条，不再卡死界面。",
      "2. 首页对比：修复预设列大量显示「—」——对比数据此前只取预设榜单的分页切片+搜索过滤，现改为全量比对，任意行都能显示预设对比数值；列头排序崩溃同步修复。",
      "3. 实时社区Buff：数据未就绪不再卡 1 小时；开开关立即拉取。",
      "4. 贤者之石：来源买价全等级取最低卖单，修复误显「无单」；自制价按最终步骤单次材料成本计算；价差按卖出石头的税后到手价−单颗净成本计算。",
      "5. 一键导入：误报「导入失败」改为明确指引；安装链接高亮；插件关闭后不再静默导入 2 小时前的旧缓存；神龛缺座不再静默按等级0——导入时提示不完整、合并导入保留原值（根因由插件 3.1.2 修复）。",
      "6. 装备优化：选采集专业（挤奶/采摘/伐木）点「开始优化」崩溃修复；炼金偶发 NaN 显示修复（脏市场数据拦截）。",
      "7. 社区Buff：下线游戏已移除的「强化速度」条目；实时等级超 12 小时无人上报自动过期回退手动值。",
      "8. 菜单：「打野工具」提升为独立入口，排在「贤者镜计算」上方。",
      "",
      "二、装备优化新功能：预算上限",
      "1. 配置区可填「预算上限」（M=百万金币）：单件支出超预算的装备不再被推荐，绝不出天价建议。",
      "2. 开「卖旧装抵扣」时按净支出与预算比较；开「显示全部候选」可见超预算项（灰显+标记）。",
      "",
      "三、首页新功能：最高利润步骤",
      "1. 锻造/制造/裁缝筛选区新增「最高利润步骤」勾选：同一产物的多条步数路径（1步买料 / 2步…N步火车）只保留利润/h 最高的一条。",
      "2. 品牌标识：版本号与公告/更新日志署名换用游戏同款小鸭图标 + 渐变绿名字。"
    ].join("\n")
  },
  link: {
    url: "https://www.milkonomy.top/#/changelog",
    text: "查看详情"
  }
}

const STORAGE_KEY = "announcement-dismissed-2026"

/**
 * 检查公告是否应该显示
 */
export function shouldShowAnnouncement(): boolean {
  if (!announcementConfig.enabled) return false
  const dismissed = localStorage.getItem(STORAGE_KEY)
  return dismissed !== announcementConfig.id
}

/**
 * 关闭/忽略公告
 */
export function dismissAnnouncement(): void {
  localStorage.setItem(STORAGE_KEY, announcementConfig.id)
}
