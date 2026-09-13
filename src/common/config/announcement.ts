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
  id: "v2.8.0-baseline-compare",
  message: {
    title: "v2.8.0 更新公告",
    content: [
      "一、装备优化页大更新（本次主推）",
      "1. 「选择基准」：每个专业可自选基准项目，替代固定「利润前 N」；默认基准数 3 → 5。",
      "2. 候选扩充：三制造加入全部基础材料（奶酪/木板/布料/皮革）；炼金按转化/分解/点金三种玩法分别提供候选。",
      "3. 展开建议行可看每个基准项目换装前后（橙/绿）对比；开「卖旧装抵扣」后回本按净支出计。",
      "",
      "二、首页「对比」回归",
      "1. 恢复多预设对比（选 2~5 个预设，利润排行按颜色并排）；经验/h 列可点击排序。",
      "",
      "三、贤者之石「买材料自制」",
      "1. 勾选后来源一律按材料成本计价并重排排行榜，买价列划线显示市场价对照。",
      "",
      "四、社区Buff实时化（配合插件 3.1.0）",
      "1. 预设社区Buff卡片新增「实时社区Buff」开关，约 1 分钟刷新，无数据回退快照。",
      "",
      "五、强化计算：目标等级快捷按钮",
      "1. 目标框旁 3 个方形快捷按钮（默认 10/12/14），齿轮可自定义（本地记忆）。",
      "",
      "六、修复",
      "1. 稀有发现勾选失效五处；一键导入装备档位以实际穿戴为准；打野筛选「强化」为空；强化页卖价偏离市场区间提示。"
    ].join("\n")
  },
  link: {
    url: "https://polokikiki.github.io/Milkonomy/#/changelog",
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
