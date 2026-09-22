<script lang="ts" setup>
import type { OpportunityFamily, OpportunityResult, OpportunityRow } from "@/common/apis/opportunity"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { useMemory } from "@@/composables/useMemory"
import { usePagination } from "@@/composables/usePagination"
import * as Format from "@@/utils/format"
import { Search } from "@element-plus/icons-vue"
import { buildSuperTree } from "@/calculator/superAlchemy"
import { getOpportunityDataApi, OpportunityScanCancelledError } from "@/common/apis/opportunity"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
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
const executableOnly = useMemory("opportunity-executable-only", true)
const minVolume = useMemory("opportunity-min-volume", undefined as number | undefined)
const lowTierTrainHrids = useMemory("opportunity-low-tier-train-hrids", "")
const maxAlchemyNodes = useMemory("opportunity-max-alchemy-nodes", 6000)
const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "opportunity-pagination")

const rows = ref<OpportunityRow[]>([])
const loading = ref(false)
const scanText = ref("")
const scannedAt = ref(0)
const scanResult = ref<OpportunityResult>()
let generation = 0

function configuredLowTierHrids(): string[] {
  return lowTierTrainHrids.value.split(/[\s,，]+/).map((value: string) => value.trim()).filter(Boolean)
}

async function load() {
  if (!useGameStore().marketData || !useGameStore().gameData) return
  const current = ++generation
  loading.value = true
  scanText.value = t("准备扫描")
  try {
    const result = await getOpportunityDataApi({
      includeTax: includeTax.value,
      includeRare: includeRare.value,
      families: selectedFamilies.value,
      lowTierTrain: { itemHrids: configuredLowTierHrids() },
      maxAlchemyNodes: maxAlchemyNodes.value,
      isCancelled: () => current !== generation
    }, (progress) => {
      if (current === generation) scanText.value = `${progress.label} ${progress.completed}/${progress.total}`
    })
    if (current !== generation) return
    rows.value = result.rows
    scanResult.value = result
    scannedAt.value = result.marketTimestamp
    scanText.value = `${t("已扫描")} ${result.rows.length} ${t("条路线")}`
  } catch (error) {
    if (current !== generation) return
    if (error instanceof OpportunityScanCancelledError) {
      scanText.value = t("扫描已取消")
      return
    }
    console.error(error)
    rows.value = []
    scanText.value = t("扫描失败")
  } finally {
    if (current === generation) loading.value = false
  }
}

function cancelScan() {
  generation++
  loading.value = false
  scanText.value = t("扫描已取消")
}

watch([
  includeTax,
  includeRare,
  selectedFamilies,
  lowTierTrainHrids,
  maxAlchemyNodes,
  () => useGameStore().marketData,
  () => useGameStore().buyStatus,
  () => useGameStore().sellStatus,
  () => usePlayerStore().configVersion
], load, { deep: true, immediate: true })

const filteredRows = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return rows.value.filter((row) => {
    if (executableOnly.value && row.status !== "priced") return false
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
const detailRow = ref<OpportunityRow>()
const superDetailName = ref("")
const superDetailRows = ref<any[]>([])
function showDetail(row: OpportunityRow) {
  detailRow.value = row
  detailVisible.value = true
  if (row.superAlchemy) {
    const tree = buildSuperTree(row.superAlchemy.item, {
      catalystRanks: [0, 1, 2],
      sellTaxFactor: includeTax.value ? 0.95 : 1,
      mode: "smart",
      includeRare: includeRare.value
    }, row.superAlchemy.ask)
    const flatten = (node: any): any[] => [node, ...node.children.flatMap((child: any) => flatten(child))]
    superDetailName.value = row.name
    superDetailRows.value = flatten(tree.root)
  } else {
    superDetailRows.value = []
  }
}

function flowText(flow: { hrid: string, level: number, count: number, price: number, source: string }) {
  const level = flow.level ? ` +${flow.level}` : ""
  return `${flow.hrid}${level} × ${Format.number(flow.count)} @ ${Format.money(flow.price)} (${flow.source})`
}

function saveExport(kind: "json" | "csv") {
  const result = scanResult.value
  if (!result) return
  const filename = `opportunity-${result.snapshotId.replaceAll(":", "-")}.${kind}`
  const exportRows = result.rows.map(({ calculator: _calculator, superAlchemy: _superAlchemy, ...row }) => row)
  const content = kind === "json"
    ? JSON.stringify({ ...result, rows: exportRows }, null, 2)
    : [
        ["snapshotId", "marketTimestamp", "id", "family", "name", "project", "status", "steps", "profitPH", "profitRate", "costPH", "incomePH", "volume1h"].join(","),
        ...result.rows.map(row => [result.snapshotId, result.marketTimestamp, row.id, row.family, row.name, row.project, row.status, row.stepCount, row.profitPH, row.profitRate, row.costPH, row.incomePH, row.volume1h]
          .map(value => `"${String(value).replaceAll("\"", "\"\"")}"`)
          .join(","))
      ].join("\n")
  const url = URL.createObjectURL(new Blob([content], { type: kind === "json" ? "application/json" : "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function familyCountText(result: OpportunityResult) {
  return result.scannedFamilies.map(family => `${family}: ${result.familyCounts[family] ?? 0}`).join(" · ")
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
          <el-checkbox v-model="executableOnly">
            {{ t('仅可执行报价') }}
          </el-checkbox>
          <span>{{ t('成交量(1h)') }} ≥</span>
          <el-input-number v-model="minVolume" :min="0" :controls="false" size="small" style="width: 76px" />
          <el-checkbox-group v-model="selectedFamilies" size="small">
            <el-checkbox-button v-for="family in FAMILIES" :key="family" :label="family">
              {{ t(family) }}
            </el-checkbox-button>
          </el-checkbox-group>
          <el-button size="small" :loading="loading" @click="load">
            {{ t('重新扫描') }}
          </el-button>
          <el-button v-if="loading" size="small" @click="cancelScan">
            {{ t('取消') }}
          </el-button>
          <el-button size="small" :disabled="!scanResult" @click="saveExport('json')">
            JSON
          </el-button>
          <el-button size="small" :disabled="!scanResult" @click="saveExport('csv')">
            CSV
          </el-button>
        </div>
        <el-input v-model="lowTierTrainHrids" class="mt-2" :placeholder="t('低级火车材料 HRID（逗号分隔；仅排除全部步骤均命中的纯材料链）')" />
        <div class="mt-2">
          <span>{{ t('炼金节点上限') }}：</span>
          <el-input-number v-model="maxAlchemyNodes" :min="1" :controls="false" size="small" style="width: 100px" />
        </div>
      </template>

      <div class="status-row">
        <span>{{ scanText }}</span>
        <span v-if="scannedAt">{{ t('行情时间戳') }}: {{ new Date(scannedAt).toLocaleString() }}</span>
        <el-tag v-if="scanResult" :type="scanResult.excludedLowTierTrain ? 'success' : 'warning'" size="small">
          {{ t('低级火车排除') }}: {{ scanResult.excludedLowTierTrain }}
        </el-tag>
        <span v-if="scanResult">{{ t('扫描快照') }}: {{ scanResult.snapshotId }}</span>
        <span v-if="scanResult">{{ familyCountText(scanResult) }}</span>
      </div>
      <el-alert v-for="warning in scanResult?.warnings" :key="warning" class="mb-2" type="warning" :closable="false" show-icon :title="t(warning)" />
      <el-alert v-for="reason in scanResult?.limitReasons" :key="reason" class="mb-2" type="warning" :closable="false" show-icon :title="`${t('受限扫描')}：${reason}`" />
      <el-alert
        v-if="scanResult?.excludedLowTierSamples.length"
        class="mb-2"
        type="info"
        :closable="false"
        :title="`${t('低级火车排除样例')}：${scanResult.excludedLowTierSamples.map(sample => sample.name || sample.hrid).join('、')}`"
      />
      <el-alert v-if="selectedFamilies.length === 0" class="mb-2" type="info" :closable="false" :title="t('未选择路线族；扫描结果为空。')" />

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
        <el-table-column prop="status" :label="t('报价')" min-width="86">
          <template #default="{ row }">
            <el-tag :type="row.status === 'priced' ? 'success' : 'warning'" size="small">
              {{ row.status === 'priced' ? t('可执行') : t('待补价') }}
            </el-tag>
          </template>
        </el-table-column>
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
            <el-link :icon="Search" type="primary" @click="showDetail(row)">
              {{ t('查看') }}
            </el-link>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager-wrapper">
        <el-pagination background :layout="paginationData.layout" :page-sizes="paginationData.pageSizes" :total="paginationData.total" :page-size="paginationData.pageSize" :current-page="paginationData.currentPage" @size-change="handleSizeChange" @current-change="handleCurrentChange" />
      </div>
    </el-card>
    <el-dialog v-model="detailVisible" :title="`${t('路线详情')}：${detailRow?.name ?? ''}`" width="min(1080px, 94vw)">
      <el-descriptions v-if="detailRow" :column="4" border class="mb-3">
        <el-descriptions-item :label="t('净利润')">
          {{ Format.money(detailRow.netProfit) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('总投入估计')">
          {{ Format.money(detailRow.totalCost) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('总工时')">
          {{ Format.number(detailRow.timeSec) }}s
        </el-descriptions-item>
        <el-descriptions-item :label="t('扫描快照')">
          {{ detailRow.snapshotId }}
        </el-descriptions-item>
      </el-descriptions>
      <el-alert v-for="warning in detailRow?.warnings" :key="warning" type="warning" :closable="false" class="mb-2" :title="warning" />
      <el-table v-if="detailRow" :data="detailRow.steps" max-height="320" class="mb-3">
        <el-table-column prop="action" :label="t('动作')" min-width="120" />
        <el-table-column prop="hrid" :label="t('物品')" min-width="190" />
        <el-table-column prop="executions" :label="t('期望次数')" align="right">
          <template #default="{ row }">
            {{ Format.number(row.executions) }}
          </template>
        </el-table-column>
        <el-table-column prop="timeSec" :label="t('工时(秒)')" align="right">
          <template #default="{ row }">
            {{ Format.number(row.timeSec) }}
          </template>
        </el-table-column>
      </el-table>
      <el-row v-if="detailRow" :gutter="12" class="mb-3">
        <el-col :xs="24" :md="12">
          <h4>{{ t('外部采购') }}</h4>
          <div v-for="flow in detailRow.externalInputs" :key="`in-${flow.hrid}-${flow.level}`" class="flow-row">
            {{ flowText(flow) }}
          </div>
        </el-col>
        <el-col :xs="24" :md="12">
          <h4>{{ t('外部出售') }}</h4>
          <div v-for="flow in detailRow.externalOutputs" :key="`out-${flow.hrid}-${flow.level}`" class="flow-row">
            {{ flowText(flow) }}
          </div>
        </el-col>
      </el-row>
      <h4 v-if="superDetailRows.length">
        {{ t('炼金展开链') }}：{{ superDetailName }}
      </h4>
      <el-table v-if="superDetailRows.length" :data="superDetailRows" max-height="500">
        <el-table-column prop="hrid" :label="t('物品')" min-width="200" />
        <el-table-column prop="action" :label="t('动作')" min-width="100" />
        <el-table-column prop="count" :label="t('数量')" align="right" />
        <el-table-column prop="stepTimeSec" :label="t('工时(秒)')" align="right" />
        <el-table-column prop="stepCost" :label="t('步骤成本')" align="right">
          <template #default="{ row }">
            {{ Format.money(row.stepCost) }}
          </template>
        </el-table-column>
        <el-table-column prop="chainIncome" :label="t('链收入')" align="right">
          <template #default="{ row }">
            {{ Format.money(row.chainIncome) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('报价')">
          <template #default="{ row }">
            {{ row.priceInvalid ? t('待补价') : t('可执行') }}
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
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
.flow-row {
  padding: 3px 0;
  overflow-wrap: anywhere;
}
.profit {
  color: #16ab1b;
}
.loss {
  color: #f56c6c;
}
</style>
