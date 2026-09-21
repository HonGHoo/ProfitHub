<script lang="ts" setup>
import type Calculator from "@/calculator"
import type { OpportunityFamily, OpportunityRow } from "@/common/apis/opportunity"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { useMemory } from "@@/composables/useMemory"
import { usePagination } from "@@/composables/usePagination"
import * as Format from "@@/utils/format"
import { Search } from "@element-plus/icons-vue"
import { getOpportunityDataApi } from "@/common/apis/opportunity"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import ActionDetail from "../dashboard/components/ActionDetail.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

defineOptions({ name: "Opportunity" })

const { t } = useI18n()
const FAMILIES: OpportunityFamily[] = ["单步/制作", "制作炼金", "多步炼金", "直接强化", "制作强化", "继承强化"]
const includeTax = useMemory("opportunity-include-tax", true)
const includeRare = useMemory("opportunity-include-rare", true)
const selectedFamilies = useMemory("opportunity-families", [...FAMILIES])
const search = useMemory("opportunity-search", "")
const positiveOnly = useMemory("opportunity-positive-only", true)
const minVolume = useMemory("opportunity-min-volume", undefined as number | undefined)
const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "opportunity-pagination")

const rows = ref<OpportunityRow[]>([])
const loading = ref(false)
const scanText = ref("")
const scannedAt = ref(0)
let generation = 0

async function load() {
  if (!useGameStore().marketData || !useGameStore().gameData) return
  const current = ++generation
  loading.value = true
  scanText.value = t("准备扫描")
  try {
    const result = await getOpportunityDataApi({
      includeTax: includeTax.value,
      includeRare: includeRare.value,
      families: selectedFamilies.value
    }, (progress) => {
      if (current === generation) scanText.value = `${progress.label} ${progress.completed}/${progress.total}`
    })
    if (current !== generation) return
    rows.value = result.rows
    scannedAt.value = result.marketTimestamp
    scanText.value = `${t("已扫描")} ${result.rows.length} ${t("条路线")}`
  } catch (error) {
    if (current !== generation) return
    console.error(error)
    rows.value = []
    scanText.value = t("扫描失败")
  } finally {
    if (current === generation) loading.value = false
  }
}

watch([
  includeTax,
  includeRare,
  selectedFamilies,
  () => useGameStore().marketData,
  () => useGameStore().buyStatus,
  () => useGameStore().sellStatus,
  () => usePlayerStore().configVersion
], load, { deep: true, immediate: true })

const filteredRows = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return rows.value.filter((row) => {
    if (positiveOnly.value && row.profitPH <= 0) return false
    if (minVolume.value !== undefined && minVolume.value !== null && row.volume1h < minVolume.value) return false
    if (keyword && !(`${row.name} ${row.project} ${row.family}`).toLocaleLowerCase().includes(keyword)) return false
    return true
  })
})

const pagedRows = computed(() => {
  const start = (paginationData.currentPage - 1) * paginationData.pageSize
  return filteredRows.value.slice(start, start + paginationData.pageSize)
})

watch(filteredRows, () => {
  paginationData.total = filteredRows.value.length
  if ((paginationData.currentPage - 1) * paginationData.pageSize >= filteredRows.value.length) paginationData.currentPage = 1
}, { immediate: true })

const detailVisible = ref(false)
const detailCalculator = ref<Calculator>()
function showDetail(row: OpportunityRow) {
  if (!row.calculator) return
  detailCalculator.value = row.calculator
  detailVisible.value = true
}

const onPriceStatusChange = usePriceStatus("opportunity-price-status")
</script>

<template>
  <div class="app-container">
    <div class="game-info">
      <GameInfo />
      <div><ActionConfig /></div>
      <PriceStatusSelect @change="onPriceStatusChange" />
      <el-checkbox v-model="includeTax">
        {{ t('计算税率') }}
      </el-checkbox>
      <el-checkbox v-model="includeRare">
        {{ t('稀有发现') }}
      </el-checkbox>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="mb-3"
      :title="t('全市场机会按税后期望利润 / h 排序；即时场景按左价买入、右价卖出。成交量仅作市场容量提示。')"
    />

    <el-card>
      <template #header>
        <div class="flex items-center flex-wrap gap-2">
          <span class="title">{{ t('全市场机会') }}</span>
          <el-input v-model="search" clearable size="small" :placeholder="t('搜索')" style="width: 140px" />
          <el-checkbox v-model="positiveOnly">
            {{ t('仅正利润') }}
          </el-checkbox>
          <span>{{ t('成交量(1h)') }} ≥</span>
          <el-input-number v-model="minVolume" :min="0" :controls="false" size="small" style="width: 76px" />
          <el-checkbox-group v-model="selectedFamilies" size="small">
            <el-checkbox-button v-for="family in FAMILIES" :key="family" :label="family">
              {{ t(family) }}
            </el-checkbox-button>
          </el-checkbox-group>
        </div>
      </template>

      <div class="status-row">
        <span>{{ scanText }}</span>
        <span v-if="scannedAt">{{ t('行情时间戳') }}: {{ new Date(scannedAt).toLocaleString() }}</span>
        <el-tooltip :content="t('低级火车尚未设置可验证的材料链与档位规则，因此当前完整保留多步路线，避免误删装备、炼金和混合链。')">
          <el-tag type="warning" size="small">
            {{ t('低级火车未筛除') }}
          </el-tag>
        </el-tooltip>
      </div>

      <el-table :data="pagedRows" v-loading="loading" :default-sort="{ prop: 'profitPH', order: 'descending' }">
        <el-table-column width="52">
          <template #default="{ row }">
            <ItemIcon :hrid="row.hrid" />
          </template>
        </el-table-column>
        <el-table-column prop="name" :label="t('物品')" min-width="145" />
        <el-table-column prop="family" :label="t('路线')" min-width="112">
          <template #default="{ row }">
            <el-tag size="small">
              {{ t(row.family) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="project" :label="t('动作')" min-width="125" />
        <el-table-column prop="stepCount" :label="t('步数')" align="center" sortable />
        <el-table-column prop="profitPH" :label="t('利润 / h')" min-width="110" align="right" sortable>
          <template #default="{ row }">
            <span :class="row.profitPH < 0 ? 'loss' : 'profit'">{{ Format.money(row.profitPH) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="profitRate" :label="t('利润率')" align="right" sortable>
          <template #default="{ row }">
            {{ Format.percent(row.profitRate) }}
          </template>
        </el-table-column>
        <el-table-column prop="costPH" :label="t('成本 / h')" min-width="105" align="right" sortable>
          <template #default="{ row }">
            {{ Format.money(row.costPH) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('成交量(1h)')" min-width="100" align="right">
          <template #default="{ row }">
            {{ row.volume1h >= 0 ? Format.number(row.volume1h) : '-' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('详情')" fixed="right" align="center">
          <template #default="{ row }">
            <el-link v-if="row.calculator" :icon="Search" type="primary" @click="showDetail(row)">
              {{ t('查看') }}
            </el-link>
            <el-text v-else type="info" size="small">
              {{ t('炼金链') }}
            </el-text>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager-wrapper">
        <el-pagination background :layout="paginationData.layout" :page-sizes="paginationData.pageSizes" :total="paginationData.total" :page-size="paginationData.pageSize" :current-page="paginationData.currentPage" @size-change="handleSizeChange" @current-change="handleCurrentChange" />
      </div>
    </el-card>
    <ActionDetail v-model="detailVisible" :data="detailCalculator" />
  </div>
</template>

<style lang="scss" scoped>
.title {
  font-weight: 600;
  min-width: 100px;
}
.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.pager-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
.profit {
  color: #16ab1b;
}
.loss {
  color: #f56c6c;
}
</style>
