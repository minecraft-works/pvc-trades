/**
 * The item rules of the biomes: which item IDs come from each one. Loaded on
 * demand (ADR-021) by `loadBiomeRules` in biomes.ts, as the lists are most of
 * the biome feature's size and only needed once a biome is in use.
 *
 * @module search/biome-rules
 */

/** Which item IDs come from a biome */
export interface BiomeRule {
    readonly ids: readonly string[];
    readonly suffixes?: readonly string[];
}

/**
 * What a tree drops: its logs, wood, leaves and sapling. Planks and
 * stripped logs are made from it, so they don't count.
 * @param wood - Wood type, e.g. "jungle"
 * @returns Item IDs
 */
function tree(wood: string): readonly string[] {
    return [`${wood}_log`, `${wood}_wood`, `${wood}_leaves`, `${wood}_sapling`];
}

/**
 * What a nether forest's fungus drops: its stems, hyphae, nylium, fungus and roots.
 * @param wood - Wood type, "crimson" or "warped"
 * @returns Item IDs
 */
function fungus(wood: string): readonly string[] {
    return [`${wood}_stem`, `${wood}_hyphae`, `${wood}_nylium`, `${wood}_fungus`, `${wood}_roots`];
}

/**
 * Pottery sherds of a structure, found by brushing its suspicious sand or gravel.
 * @param patterns - Sherd patterns, e.g. "archer"
 * @returns Item IDs
 */
function sherds(...patterns: readonly string[]): readonly string[] {
    return patterns.map(pattern => `${pattern}_pottery_sherd`);
}

const MUSHROOMS: readonly string[] = ['red_mushroom', 'brown_mushroom', 'red_mushroom_block', 'brown_mushroom_block', 'mushroom_stem'];
const TULIPS: readonly string[] = ['red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip'];
/** Warm ocean ruins */
const WARM_RUIN_SHERDS = sherds('angler', 'shelter', 'snort');
const WARM_SEA: readonly string[] = ['tropical_fish', 'tropical_fish_bucket', 'pufferfish', 'pufferfish_bucket', 'sea_pickle'];
const CORAL: readonly string[] = ['_coral', '_coral_block', '_coral_fan'];

/**
 * Rules per biome ID (see BIOMES in biomes.ts). Loot of a structure that only
 * generates in one biome counts for that biome: the desert pyramid's dune
 * trim, the woodland mansion's vex trim. Structures found in many biomes
 * (trial chambers, trail ruins, strongholds, nether fortresses) count for none.
 */
export const BIOME_RULES: Readonly<Record<string, BiomeRule>> = {
    plains: { ids: ['sunflower', 'pumpkin', 'short_grass', 'tall_grass', 'bush', 'oxeye_daisy', 'azure_bluet', 'cornflower', ...TULIPS] },
    forest: { ids: [...tree('oak'), 'apple', 'bee_nest', 'honeycomb', 'leaf_litter', 'bush', 'lily_of_the_valley', 'lilac', 'rose_bush', 'peony'] },
    birch_forest: { ids: [...tree('birch'), 'wildflowers'] },
    // Including the woodland mansion
    dark_forest: { ids: [...tree('dark_oak'), ...MUSHROOMS, 'vex_armor_trim_smithing_template'] },
    taiga: { ids: [...tree('spruce'), 'sweet_berries', 'fern', 'large_fern', 'podzol', 'mossy_cobblestone'] },
    snowy: { ids: ['snow_block', 'snowball', 'ice', 'packed_ice', 'blue_ice'] },
    mountains: { ids: ['goat_horn', 'emerald_ore', 'calcite', 'powder_snow_bucket', 'packed_ice'] },
    cherry_grove: { ids: [...tree('cherry'), 'pink_petals'] },
    pale_garden: {
        ids: [
            ...tree('pale_oak'), 'pale_moss_block', 'pale_moss_carpet', 'pale_hanging_moss', 'creaking_heart', 'resin_clump',
            'open_eyeblossom', 'closed_eyeblossom',
        ],
    },
    // Including the jungle temple
    jungle: { ids: [...tree('jungle'), 'bamboo', 'cocoa_beans', 'melon', 'melon_slice', 'vine', 'wild_armor_trim_smithing_template'] },
    bamboo_jungle: { ids: ['bamboo'] },
    savanna: { ids: [...tree('acacia'), 'armadillo_scute'] },
    desert: {
        ids: [
            'sand', 'sandstone', 'cut_sandstone', 'chiseled_sandstone', 'suspicious_sand', 'cactus', 'cactus_flower', 'dead_bush',
            'short_dry_grass', 'tall_dry_grass', 'rabbit_hide', 'rabbit_foot',
            // Desert pyramid and desert well
            'dune_armor_trim_smithing_template', ...sherds('archer', 'miner', 'prize', 'skull', 'arms_up', 'brewer'),
        ],
    },
    // Only the terracotta colours that generate there; the others are dyed
    badlands: {
        ids: [
            'red_sand', 'red_sandstone', 'terracotta', 'white_terracotta', 'orange_terracotta', 'yellow_terracotta',
            'brown_terracotta', 'red_terracotta', 'light_gray_terracotta', 'dead_bush', 'armadillo_scute',
        ],
    },
    swamp: { ids: ['lily_pad', 'blue_orchid', 'vine', 'clay', 'clay_ball', 'slime_ball', 'firefly_bush'] },
    mangrove_swamp: {
        ids: ['mangrove_log', 'mangrove_wood', 'mangrove_leaves', 'mangrove_propagule', 'mangrove_roots', 'muddy_mangrove_roots', 'mud', 'lily_pad', 'firefly_bush'],
    },
    mushroom_fields: { ids: ['mycelium', ...MUSHROOMS] },
    beach: { ids: ['turtle_egg', 'turtle_scute', 'sugar_cane', 'sand', 'clay', 'clay_ball'] },
    // The whole sea, with ocean monuments, shipwrecks, ocean ruins and buried treasure
    ocean: {
        ids: [
            'prismarine', 'prismarine_bricks', 'dark_prismarine', 'sea_lantern', 'prismarine_shard', 'prismarine_crystals', 'sponge',
            'wet_sponge', 'kelp', 'seagrass', 'heart_of_the_sea', 'nautilus_shell', 'trident', 'cod', 'cod_bucket', 'salmon',
            'salmon_bucket', 'ink_sac', 'glow_ink_sac', 'coast_armor_trim_smithing_template', 'tide_armor_trim_smithing_template',
            ...WARM_SEA, ...WARM_RUIN_SHERDS, ...sherds('blade', 'explorer', 'mourner', 'plenty'),
        ],
        suffixes: CORAL,
    },
    warm_ocean: { ids: [...WARM_SEA, ...WARM_RUIN_SHERDS], suffixes: CORAL },
    lush_caves: {
        ids: [
            'azalea', 'flowering_azalea', 'azalea_leaves', 'flowering_azalea_leaves', 'moss_block', 'moss_carpet', 'glow_berries',
            'spore_blossom', 'big_dripleaf', 'small_dripleaf', 'rooted_dirt', 'hanging_roots', 'glow_lichen', 'axolotl_bucket',
        ],
    },
    dripstone_caves: { ids: ['pointed_dripstone', 'dripstone_block'] },
    // Including what the ancient cities hold
    deep_dark: {
        ids: [
            'sculk', 'sculk_vein', 'sculk_catalyst', 'sculk_sensor', 'sculk_shrieker', 'echo_shard', 'disc_fragment_5',
            'music_disc_otherside', 'ward_armor_trim_smithing_template', 'silence_armor_trim_smithing_template',
        ],
    },
    nether_wastes: { ids: ['netherrack', 'nether_quartz_ore', 'quartz', 'nether_gold_ore', 'glowstone', 'glowstone_dust', 'nether_wart'] },
    crimson_forest: { ids: [...fungus('crimson'), 'nether_wart_block', 'shroomlight', 'weeping_vines'] },
    warped_forest: { ids: [...fungus('warped'), 'warped_wart_block', 'shroomlight', 'twisting_vines', 'nether_sprouts'] },
    soul_sand_valley: { ids: ['soul_sand', 'soul_soil', 'bone_block', 'ghast_tear'] },
    basalt_deltas: { ids: ['basalt', 'blackstone', 'magma_block', 'magma_cream'] },
    // Including what the end cities and ships hold
    the_end: {
        ids: [
            'end_stone', 'chorus_fruit', 'chorus_flower', 'chorus_plant', 'purpur_block', 'purpur_pillar', 'end_rod', 'shulker_shell',
            'elytra', 'dragon_head', 'dragon_egg', 'dragon_breath', 'spire_armor_trim_smithing_template',
        ],
    },
};
