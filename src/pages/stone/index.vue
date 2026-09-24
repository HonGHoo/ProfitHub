<script lang="ts" setup>
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { useMemory } from "@@/composables/useMemory"
import * as Format from "@@/utils/format"
import { Close, CopyDocument, Warning } from "@element-plus/icons-vue"
import { ElMessage } from "element-plus"
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { computeStoneLeaderboard, type StoneLeaderboardResult, type StoneSourceRow } from "@/calculator/alchemyChain"
import { getGameDataApi, getItemDetailOf } from "@/common/apis/game"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import { PriceStatus, useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

const { t } = useI18n()

const catalystRank = useMemory("stone-catalyst-rank", -1)
const includeTax = useMemory("stone-include-tax", true)
const includeRare = useMemory("stone-include-rare", true)
const craftMode = useMemory("stone-craft-mode", false)
const materialPriceStatusOverrides = useMemory("stone-material-price-status-overrides", {} as Record<string, Record<string, PriceStatus>>, 0)
const GLOBAL_PRICE_STATUS = "GLOBAL"

const onPriceStatusChange = usePriceStatus("stone-price-status")
function handlePriceStatusChange() {
  onPriceStatusChange()
  // 立即 compute 会读到尚未刷新的旧价格状态（全局 status 由异步 watcher 更新），
  // 真正的重算交给下面的 statuses watcher，保证按新设置取价
}

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const stoneResult = ref<StoneLeaderboardResult | null>(null)
const hoveredCostHrid = ref<string | null>(null)
const pinnedCostHrid = ref<string | null>(null)
let costHideTimer: ReturnType<typeof setTimeout> | undefined

// 价差口径（利润）：卖出一颗贤者之石的税后到手价 − 单颗净成本。
// 计税时石头与副产物均按 95% 到手价计算。
const stoneBidAfterTax = computed(() => {
  if (!stoneResult.value) return -1
  return stoneResult.value.stoneBid * (includeTax.value ? SELL_TAX_FACTOR : NO_TAX_FACTOR)
})

const itemName = (hrid: string) => t(getItemDetailOf(hrid)?.name ?? hrid)

async function copyItemName(hrid: string) {
  try {
    await navigator.clipboard.writeText(itemName(hrid))
    ElMessage.success(t("已复制到剪贴板"))
  } catch {
    ElMessage.error(t("复制失败，请检查浏览器权限设置"))
  }
}

const materialPriceStatusOptions = computed<Array<{ value: PriceStatus | typeof GLOBAL_PRICE_STATUS, label: string }>>(() => [
  { value: GLOBAL_PRICE_STATUS, label: t("跟随") },
  { value: PriceStatus.ASK, label: t("左") },
  { value: PriceStatus.ASK_LOW, label: `${t("左")}-` },
  { value: PriceStatus.BID, label: t("右") },
  { value: PriceStatus.BID_HIGH, label: `${t("右")}+` }
])

function cancelCostHide() {
  if (costHideTimer) clearTimeout(costHideTimer)
  costHideTimer = undefined
}

function showCostPopover(hrid: string) {
  cancelCostHide()
  hoveredCostHrid.value = hrid
}

function scheduleCostHide(hrid: string) {
  cancelCostHide()
  costHideTimer = setTimeout(() => {
    if (hoveredCostHrid.value === hrid) hoveredCostHrid.value = null
  }, 180)
}

function togglePinnedCost(hrid: string) {
  cancelCostHide()
  pinnedCostHrid.value = pinnedCostHrid.value === hrid ? null : hrid
  hoveredCostHrid.value = hrid
}

function closeCostPopover(hrid: string) {
  if (pinnedCostHrid.value === hrid) pinnedCostHrid.value = null
  if (hoveredCostHrid.value === hrid) hoveredCostHrid.value = null
}

function isCostPopoverVisible(hrid: string) {
  return hoveredCostHrid.value === hrid || pinnedCostHrid.value === hrid
}

function actionLabel(action: string) {
  return action === "cheesesmithing" ? t("锻造") : action === "tailoring" ? t("裁缝") : t("制造")
}

function priceStatusLabel(status: PriceStatus) {
  if (status === PriceStatus.ASK_LOW) return `${t("左")}-`
  if (status === PriceStatus.BID) return t("右")
  if (status === PriceStatus.BID_HIGH) return `${t("右")}+`
  return t("左")
}

function priceSourceLabel(source: string, status: PriceStatus) {
  if (source === "shop") return t("商店固定价")
  if (source === "craft") return t("制造价回退")
  return `${t("市场价")} · ${priceStatusLabel(status)}`
}

function materialPriceStatusOf(sourceHrid: string, materialHrid: string): PriceStatus | typeof GLOBAL_PRICE_STATUS {
  return materialPriceStatusOverrides.value[sourceHrid]?.[materialHrid] ?? GLOBAL_PRICE_STATUS
}

function setMaterialPriceStatus(sourceHrid: string, materialHrid: string, status: PriceStatus | typeof GLOBAL_PRICE_STATUS) {
  const next = { ...materialPriceStatusOverrides.value }
  const sourceOverrides = { ...(next[sourceHrid] ?? {}) }
  if (status === GLOBAL_PRICE_STATUS) {
    delete sourceOverrides[materialHrid]
  } else {
    sourceOverrides[materialHrid] = status
  }
  if (Object.keys(sourceOverrides).length) next[sourceHrid] = sourceOverrides
  else delete next[sourceHrid]
  materialPriceStatusOverrides.value = next
}

function hasCustomMaterialPrice(sourceHrid: string) {
  return Object.keys(materialPriceStatusOverrides.value[sourceHrid] ?? {}).length > 0
}

function materialCountText(row: StoneSourceRow, index: number) {
  const item = row.craftBreakdown?.items[index]
  if (!item) return "—"
  if (!item.artisanApplied || !row.craftBreakdown?.artisanBuff) return Format.number(item.count, 2)
  return `${Format.number(item.baseCount, 2)} × ${Format.percent(1 - row.craftBreakdown.artisanBuff)} = ${Format.number(item.count, 2)}`
}

const legendLines = [
  t("概率：每做一次转化/分解，真的掉出贤者之石的概率。转化本身有成功率（失败则材料全没），已一并算进去。"),
  t("买价：去市场买这件来源物品要花的钱。带「自制」标签 = 按材料成本计：市场没人卖时的回退，或勾选「买材料自制」后的计价方式。"),
  t("买材料自制：与强化页「单步配方」同口径，按最终制造步骤的一次材料成本计价（包含当前预设的工匠节省），不递归计算更早步骤，并重排排行榜；买价列同时显示市场买价（划线）供对比。"),
  t("副产物抵扣：做一次不只出石头，还会搭着出别的东西，这些搭头卖掉（扣 5% 税）能回收的钱，直接从成本里减。例：耳环买价 500M，附带 7 只小耳环回收 31M，净投入就是 469M。"),
  t("单颗净成本：（买价 + 催化剂 − 副产物抵扣）÷ 平均每次出几颗，即搞到一颗石头实际花的钱。排行榜按它从便宜到贵排。"),
  t("价差：贤者之石现价（税后到手）− 单颗净成本。绿色 = 自己做再卖比直接买一颗便宜，赚的就是这个数；红色 = 不如直接买。")
]

function catalystHridOf(row: { method: string, catalystRankUsed: number }): string | null {
  if (row.catalystRankUsed === 2) return "/items/prime_catalyst"
  if (row.catalystRankUsed === 1) {
    return row.method === "transmute" ? "/items/catalyst_of_transmutation" : "/items/catalyst_of_decomposition"
  }
  return null
}

function compute() {
  // 游戏数据未就绪时跳过，等 marketData watcher 触发
  if (!getGameDataApi() || !gameStore.marketData) return
  try {
    stoneResult.value = computeStoneLeaderboard({
      catalystRank: catalystRank.value,
      sellTaxFactor: includeTax.value ? SELL_TAX_FACTOR : NO_TAX_FACTOR,
      includeRare: includeRare.value,
      craftMode: craftMode.value,
      materialPriceStatusOverrides: materialPriceStatusOverrides.value
    })
  } catch (e) {
    console.error(e)
    ElMessage.error(t("计算失败，请打开控制台查看错误"))
  }
}

// 进页面即算；设置变化、市场数据刷新（约每小时/5 分钟轮询）、买卖价侧切换自动重算
watch([catalystRank, includeTax, includeRare, craftMode], compute, { immediate: true })
watch(() => gameStore.marketData?.timestamp, () => compute())
watch(() => [gameStore.buyStatus, gameStore.sellStatus], () => compute())
watch(() => playerStore.config, () => compute(), { deep: true })
watch(materialPriceStatusOverrides, () => compute(), { deep: true })
</script>

<template>
  <div class="app-container">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['alchemy']" />
      </div>
    </div>

    <el-card>
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <ItemIcon hrid="/items/philosophers_stone" :width="22" :height="22" />
            <span>{{ t('贤者路径计算') }}</span>
          </div>
        </div>
      </template>
      <div class="flex flex-wrap items-center gap-4">
        <PriceStatusSelect @change="handlePriceStatusChange" />
        <div class="flex items-center flex-wrap gap-2">
          <span>{{ t('催化剂') }}</span>
          <el-radio-group v-model="catalystRank" size="small">
            <el-radio-button :label="-1">
              {{ t('自动') }}
            </el-radio-button>
            <el-radio-button :label="0">
              {{ t('无') }}
            </el-radio-button>
            <el-radio-button :label="1">
              {{ t('普通') }}
            </el-radio-button>
            <el-radio-button :label="2">
              {{ t('至高') }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <el-checkbox v-model="includeTax" :label="t('计税')" />
        <el-checkbox v-model="includeRare" :label="t('稀有掉落')" />
        <el-checkbox v-model="craftMode" :label="t('买材料自制')" />
      </div>
      <div class="font-size-12px color-gray-500" style="line-height: 2; margin-top: 8px">
        <div class="font-bold">
          {{ t('名词说明') }}
        </div>
        <div v-for="line in legendLines" :key="line">
          · {{ line }}
        </div>
      </div>
    </el-card>

    <el-card v-if="stoneResult" class="mt-4">
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span>{{ t('{0} 种来源参与排行（无卖单的按制造成本计入，{1} 种无法定价未计入）', [stoneResult.rows.length, stoneResult.excludedCount]) }}</span>
          <span class="font-size-13px">
            {{ t('贤者之石现价') }}：{{ Format.price(stoneResult.stoneBid) }}
            <template v-if="includeTax">（{{ t('税后') }}：{{ Format.price(stoneBidAfterTax) }}）</template>
          </span>
        </div>
      </template>
      <el-table :data="stoneResult.rows" size="small" max-height="560">
        <el-table-column :label="t('排名')" align="center" width="60">
          <template #default="{ $index }">
            {{ $index + 1 }}
          </template>
        </el-table-column>
        <el-table-column :label="t('来源物品')" min-width="170">
          <template #default="{ row }">
            <el-popover
              :visible="isCostPopoverVisible(row.hrid)"
              placement="bottom-start"
              :fallback-placements="['top-start']"
              :width="760"
              :persistent="true"
            >
              <template #reference>
                <div class="flex items-center gap-1">
                  <span
                    class="cost-name-trigger flex items-center gap-1"
                    role="button"
                    tabindex="0"
                    :title="pinnedCostHrid === row.hrid ? t('点击取消固定') : t('悬停查看，点击固定')"
                    @mouseenter="showCostPopover(row.hrid)"
                    @mouseleave="scheduleCostHide(row.hrid)"
                    @click.stop="togglePinnedCost(row.hrid)"
                    @keydown.enter.prevent="togglePinnedCost(row.hrid)"
                  >
                    <ItemIcon :hrid="row.hrid" :width="20" :height="20" />
                    <span>{{ itemName(row.hrid) }}</span>
                    <span v-if="hasCustomMaterialPrice(row.hrid)" class="custom-price-marker">[{{ t('自') }}]</span>
                  </span>
                  <el-button
                    link
                    size="small"
                    :icon="CopyDocument"
                    :title="t('复制物品名字')"
                    :aria-label="`${t('复制物品名字')}：${itemName(row.hrid)}`"
                    @click.stop="copyItemName(row.hrid)"
                  />
                </div>
              </template>
              <div
                class="cost-popover"
                @mouseenter="showCostPopover(row.hrid)"
                @mouseleave="scheduleCostHide(row.hrid)"
              >
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-1 font-bold">
                    <ItemIcon :hrid="row.hrid" :width="22" :height="22" />
                    {{ itemName(row.hrid) }} · {{ t('单步制作成本') }}
                  </div>
                  <el-button
                    v-if="pinnedCostHrid === row.hrid"
                    link
                    circle
                    size="small"
                    :title="t('关闭')"
                    :aria-label="t('关闭')"
                    @click="closeCostPopover(row.hrid)"
                  >
                    <el-icon><Close /></el-icon>
                  </el-button>
                </div>
                <template v-if="row.craftBreakdown">
                  <div class="font-size-12px color-gray-500 mb-2">
                    {{ t('途径') }}：{{ actionLabel(row.craftBreakdown.action) }} ·
                    {{ t('工匠节省') }}：{{ Format.percent(row.craftBreakdown.artisanBuff) }}
                  </div>
                  <div class="cost-grid cost-grid-header">
                    <span>{{ t('材料') }}</span>
                    <span>{{ t('折算数量') }}</span>
                    <span>{{ t('单价') }}</span>
                    <span>{{ t('小计') }}</span>
                    <span>{{ t('选价') }}</span>
                  </div>
                  <div v-for="(item, index) in row.craftBreakdown.items" :key="`${item.hrid}-${index}`" class="cost-grid cost-grid-row">
                    <span class="flex items-center gap-1 min-w-0">
                      <ItemIcon :hrid="item.hrid" :width="18" :height="18" />
                      <span class="truncate">{{ itemName(item.hrid) }}</span>
                      <el-button
                        link
                        size="small"
                        :icon="CopyDocument"
                        :title="t('复制物品名字')"
                        :aria-label="`${t('复制物品名字')}：${itemName(item.hrid)}`"
                        @click.stop="copyItemName(item.hrid)"
                      />
                    </span>
                    <span>{{ materialCountText(row, index) }}</span>
                    <span>
                      {{ Format.money(item.unitPrice) }}
                      <small class="block color-gray-400">{{ priceSourceLabel(item.priceSource, item.priceStatus) }}</small>
                    </span>
                    <span>{{ Format.money(item.subtotal) }}</span>
                    <span class="price-status-buttons">
                      <el-button
                        v-for="option in materialPriceStatusOptions"
                        :key="option.value"
                        size="small"
                        :type="materialPriceStatusOf(row.hrid, item.hrid) === option.value ? (option.value === GLOBAL_PRICE_STATUS ? 'primary' : 'success') : ''"
                        @click="setMaterialPriceStatus(row.hrid, item.hrid, option.value)"
                      >
                        {{ option.label }}
                      </el-button>
                    </span>
                  </div>
                  <div class="flex justify-end items-center gap-3 mt-2 font-bold">
                    <span>{{ t('合计') }}</span>
                    <span>{{ Format.money(row.craftBreakdown.total) }}</span>
                  </div>
                  <div class="font-size-12px color-gray-500 mt-2">
                    {{ t('本成本只计算制作投入，不包含市场卖出税。') }}
                  </div>
                </template>
                <el-empty v-else :description="t('该物品没有可计算的单步制造配方。')" :image-size="44" />
              </div>
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column :label="t('催化剂')" align="center" width="70">
          <template #default="{ row }">
            <span v-if="catalystHridOf(row)" class="flex items-center justify-center">
              <ItemIcon :hrid="catalystHridOf(row)!" :width="22" :height="22" />
            </span>
            <span v-else>{{ t('无') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('买价')" align="right" width="150">
          <template #default="{ row }">
            <span class="flex items-center justify-end gap-1">
              <el-tag v-if="row.useCraft" size="small" type="info">
                {{ t('自制') }}
              </el-tag>
              {{ Format.price(row.buyPrice) }}
              <span
                v-if="craftMode && row.useCraft && row.marketAsk >= 0"
                class="color-gray-400"
                style="text-decoration: line-through; font-size: 12px"
              >
                {{ Format.price(row.marketAsk) }}
              </span>
            </span>
          </template>
        </el-table-column>
        <el-table-column align="right" width="130">
          <template #header>
            <el-tooltip placement="top" effect="light">
              <template #content>
                <div style="max-width: 320px">
                  {{ legendLines[4] }}
                </div>
              </template>
              <div style="display: flex; justify-content: flex-end; align-items: center; gap: 5px">
                <div>{{ t('单颗净成本') }}</div>
                <el-icon><Warning /></el-icon>
              </div>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <span class="font-bold">{{ Format.price(row.costPerStone) }}</span>
          </template>
        </el-table-column>
        <el-table-column align="right" width="120">
          <template #header>
            <el-tooltip placement="top" effect="light">
              <template #content>
                <div style="max-width: 320px">
                  {{ legendLines[5] }}
                </div>
              </template>
              <div style="display: flex; justify-content: flex-end; align-items: center; gap: 5px">
                <div>{{ t('价差') }}</div>
                <el-icon><Warning /></el-icon>
              </div>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <!-- 价差可为负，不能用 Format.price——负数会被当"无单"哨兵 -->
            <span :class="(stoneBidAfterTax - row.costPerStone) >= 0 ? 'color-green' : 'color-red'">
              {{ stoneBidAfterTax > 0 ? Format.money(stoneBidAfterTax - row.costPerStone) : "—" }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.cost-name-trigger {
  width: fit-content;
  cursor: pointer;
  border-bottom: 1px dashed var(--el-color-primary-light-3);
}

.custom-price-marker {
  color: var(--el-color-success);
  font-weight: 700;
}

.cost-grid {
  display: grid;
  grid-template-columns: minmax(130px, 1.35fr) minmax(115px, 1.15fr) minmax(90px, 0.9fr) minmax(80px, 0.8fr) minmax(
      225px,
      1.7fr
    );
  column-gap: 10px;
  align-items: center;
}

.cost-grid-header {
  padding: 6px 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.cost-grid-row {
  min-height: 42px;
  padding: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
}

.price-status-buttons {
  display: flex;
  flex-wrap: nowrap;
}

.price-status-buttons :deep(.el-button) {
  min-width: 38px;
  padding-inline: 7px;
}

.price-status-buttons :deep(.el-button + .el-button) {
  margin-left: 3px;
}
</style>
