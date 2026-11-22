import harbourJson from '../../../../packages/world/content/harbour/harbour.json';
import harbourStoryJson from '../../../../packages/story/content/harbour.json';
import counterJson from '../../../../packages/world/content/counter/counter.json';
import counterLegendJson from '../../../../packages/world/content/counter/counter.legend.json';
import counterStoryJson from '../../../../packages/story/content/counter.json';
import customsJson from '../../../../packages/world/content/customs/customs.json';
import customsLegendJson from '../../../../packages/world/content/customs/customs.legend.json';
import customsStoryJson from '../../../../packages/story/content/customs.json';
import warehouseJson from '../../../../packages/world/content/warehouse/warehouse.json';
import warehouseLegendJson from '../../../../packages/world/content/warehouse/warehouse.legend.json';
import warehouseStoryJson from '../../../../packages/story/content/warehouse.json';
import jettyJson from '../../../../packages/world/content/jetty/jetty.json';
import jettyLegendJson from '../../../../packages/world/content/jetty/jetty.legend.json';
import jettyStoryJson from '../../../../packages/story/content/jetty.json';
import manifestJson from '../../../../packages/world/content/manifest/manifest.json';
import manifestStoryJson from '../../../../packages/story/content/manifest.json';
import gatesJson from '../../../../packages/world/content/gates/gates.json';
import gatesLegendJson from '../../../../packages/world/content/gates/gates.legend.json';
import gatesStoryJson from '../../../../packages/story/content/gates.json';
import gladesJson from '../../../../packages/world/content/glades/glades.json';
import gladesLegendJson from '../../../../packages/world/content/glades/glades.legend.json';
import gladesStoryJson from '../../../../packages/story/content/glades.json';
import canopyJson from '../../../../packages/world/content/canopy/canopy.json';
import canopyLegendJson from '../../../../packages/world/content/canopy/canopy.legend.json';
import canopyStoryJson from '../../../../packages/story/content/canopy.json';
import ledgerJson from '../../../../packages/world/content/ledger/ledger.json';
import ledgerStoryJson from '../../../../packages/story/content/ledger.json';
import shaftJson from '../../../../packages/world/content/shaft/shaft.json';
import shaftLegendJson from '../../../../packages/world/content/shaft/shaft.legend.json';
import shaftStoryJson from '../../../../packages/story/content/shaft.json';
import cutJson from '../../../../packages/world/content/cut/cut.json';
import cutLegendJson from '../../../../packages/world/content/cut/cut.legend.json';
import cutStoryJson from '../../../../packages/story/content/cut.json';
import quarryJson from '../../../../packages/world/content/quarry/quarry.json';
import quarryLegendJson from '../../../../packages/world/content/quarry/quarry.legend.json';
import quarryStoryJson from '../../../../packages/story/content/quarry.json';
import { SKILL_IDS } from '@escape/curriculum';
import { contentSchema, validateContent, type StoryContent } from '@escape/story';
import { parseLegend, parseStage } from '@escape/world';
import stageJson from '../../../../packages/world/content/margin/margin.json';
import legendJson from '../../../../packages/world/content/margin/margin.legend.json';
import storyJson from '../../../../packages/story/content/margin.json';
import lowlandsJson from '../../../../packages/world/content/lowlands/lowlands.json';
import lowlandsLegendJson from '../../../../packages/world/content/lowlands/lowlands.legend.json';
import lowlandsStoryJson from '../../../../packages/story/content/lowlands.json';

import lighthouseJson from '../../../../packages/world/content/lighthouse/lighthouse.json';
import lighthouseLegendJson from '../../../../packages/world/content/lighthouse/lighthouse.legend.json';
import lighthouseStoryJson from '../../../../packages/story/content/lighthouse.json';

export const lighthouse = parseStage(lighthouseJson);
export const lighthouseLegend = parseLegend(lighthouseLegendJson);
export const stage = parseStage(stageJson);
export const legend = parseLegend(legendJson);
export const lowlands = parseStage(lowlandsJson);
export const lowlandsLegend = parseLegend(lowlandsLegendJson);
// Quarry par is best known, not proven: the new gate-clear search (maxTurns: 4) hit its 500-expansion cap.
export const quarry = parseStage(quarryJson);
export const quarryLegend = parseLegend(quarryLegendJson);
// Cut par 4 (3j dd u 26l <CR>) is best known: the full-command search hits its expansion cap. 3j27x u 26l <CR> ties it and is accepted.
export const cut = parseStage(cutJson);
export const cutLegend = parseLegend(cutLegendJson);
// Shaft par is best known; bounded full-command searches do not prove optimality.
export const shaft = parseStage(shaftJson);
export const shaftLegend = parseLegend(shaftLegendJson);
// Best known: replayed 38-key route from the brief, not a proven optimum.
// Script keystroke search (maxKeys: 38) exhausted its 1,000-expansion budget.
export const ledger = parseStage(ledgerJson);
export const ledgerLegend = quarryLegend;
// Canopy: full-command search and the retry without u/<C-r>/. both exhausted a 1.5 GB heap.
// Focused f/t/,/j search finds par 7; optimality with edits is unproven.
export const canopy = parseStage(canopyJson);
export const canopyLegend = parseLegend(canopyLegendJson);
// Motion search proves par 4, including counted G; old motions need 8 turns.
export const glades = parseStage(gladesJson);
export const gladesLegend = parseLegend(gladesLegendJson);
// Gates: focused motion search finds 8 turns; full motions hit the 15,000-expansion cap.
// Old motions also find 8; optimality over all motions remains unproven.
export const gates = parseStage(gatesJson);
export const gatesLegend = parseLegend(gatesLegendJson);
// Best known 57-key route, replayed with the engine; optimality is unproven.
export const manifest = parseStage(manifestJson);
export const manifestLegend = quarryLegend;
// Best known: focused b/d/./<C-u>/$ search finds 6 turns in 80 expansions.
// Full PORT_COMMANDS search hit 40,000 expansions at maxTurns 6; global optimality is unproven.
export const jetty = parseStage(jettyJson);
export const portLegend = parseLegend(jettyLegendJson);
// Best known 15-turn route; replayed, not solver-proven optimal.
export const warehouse = parseStage(warehouseJson);
export const warehouseLegend = parseLegend(warehouseLegendJson);
export const customs = parseStage(customsJson);
export const customsLegend = parseLegend(customsLegendJson);
export const counter = parseStage(counterJson);
export const counterLegend = parseLegend(counterLegendJson);
// Best known route, replayed with the engine; optimality is unproven.
export const harbour = parseStage(harbourJson);
export const harbourLegend = quarryLegend;
export const stages = [{ stage, legend }, { stage: lowlands, legend: lowlandsLegend }, { stage: lighthouse, legend: lighthouseLegend }, { stage: quarry, legend: quarryLegend }, { stage: cut, legend: cutLegend }, { stage: shaft, legend: shaftLegend }, { stage: ledger, legend: ledgerLegend }, { stage: canopy, legend: canopyLegend }, { stage: glades, legend: gladesLegend }, { stage: gates, legend: gatesLegend }, { stage: manifest, legend: manifestLegend }, { stage: jetty, legend: portLegend }, { stage: warehouse, legend: warehouseLegend }, { stage: customs, legend: customsLegend }, { stage: counter, legend: counterLegend }, { stage: harbour, legend: harbourLegend }];

// Validate the original JSON, rather than assigning Zod's inferred optional `undefined`
// properties to the stricter contract. Bundled JSON cannot contain undefined values.
function assertStoryJson(value: unknown): asserts value is StoryContent {
  contentSchema.parse(value);
}
const bundledStory: unknown = {
  ...storyJson,
  worlds: [...storyJson.worlds, ...lowlandsStoryJson.worlds, ...quarryStoryJson.worlds, ...canopyStoryJson.worlds, ...jettyStoryJson.worlds],
  cutscenes: [...storyJson.cutscenes, ...lighthouseStoryJson.cutscenes, ...quarryStoryJson.cutscenes, ...cutStoryJson.cutscenes, ...shaftStoryJson.cutscenes, ...ledgerStoryJson.cutscenes, ...canopyStoryJson.cutscenes, ...gladesStoryJson.cutscenes, ...gatesStoryJson.cutscenes, ...manifestStoryJson.cutscenes, ...jettyStoryJson.cutscenes, ...warehouseStoryJson.cutscenes, ...customsStoryJson.cutscenes, ...counterStoryJson.cutscenes, ...harbourStoryJson.cutscenes],
  quests: [...storyJson.quests, ...lowlandsStoryJson.quests, ...quarryStoryJson.quests, ...cutStoryJson.quests, ...shaftStoryJson.quests, ...ledgerStoryJson.quests, ...canopyStoryJson.quests, ...gladesStoryJson.quests, ...gatesStoryJson.quests, ...manifestStoryJson.quests, ...jettyStoryJson.quests, ...warehouseStoryJson.quests, ...customsStoryJson.quests, ...counterStoryJson.quests, ...harbourStoryJson.quests],
  dialogues: [...storyJson.dialogues, ...lowlandsStoryJson.dialogues, ...lighthouseStoryJson.dialogues, ...quarryStoryJson.dialogues, ...cutStoryJson.dialogues, ...shaftStoryJson.dialogues, ...ledgerStoryJson.dialogues, ...canopyStoryJson.dialogues, ...gladesStoryJson.dialogues, ...gatesStoryJson.dialogues, ...manifestStoryJson.dialogues, ...jettyStoryJson.dialogues, ...warehouseStoryJson.dialogues, ...customsStoryJson.dialogues, ...counterStoryJson.dialogues, ...harbourStoryJson.dialogues],
  reactions: [...storyJson.reactions, ...lowlandsStoryJson.reactions, ...lighthouseStoryJson.reactions, ...quarryStoryJson.reactions, ...cutStoryJson.reactions, ...shaftStoryJson.reactions, ...ledgerStoryJson.reactions, ...canopyStoryJson.reactions, ...gladesStoryJson.reactions, ...gatesStoryJson.reactions, ...manifestStoryJson.reactions, ...jettyStoryJson.reactions, ...warehouseStoryJson.reactions, ...customsStoryJson.reactions, ...counterStoryJson.reactions, ...harbourStoryJson.reactions],
};
assertStoryJson(bundledStory);
export const content = bundledStory;
const errors = validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] });
const triggerIds = new Set(stages.flatMap(entry => entry.stage.triggers.map(trigger => trigger.id)));
for (const reaction of content.reactions) {
  if (reaction.when.type === 'trigger' && !triggerIds.has(reaction.when.trigger)) {
    errors.push(`Reaction "${reaction.id}": unknown trigger "${reaction.when.trigger}".`);
  }
}
if (errors.length > 0) throw new Error(`Invalid bundled story:\n${errors.join('\n')}`);
