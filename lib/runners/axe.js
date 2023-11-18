'use strict';

const path = require('path');
const axePath = path.dirname(require.resolve('axe-core'));


/**
 * Axe's types
 * @typedef { import('axe-core') } Axe
 * @typedef { import('axe-core').Selector } AxeSelector
 * @typedef { import('axe-core').Rule } AxeRule
 * @typedef { import('axe-core').ImpactValue } AxeImpact
 * @typedef { import('axe-core').Result } AxeResult
 * @typedef { import('axe-core').RunOptions } AxeRunOptions
 */

const run = async options => {

	/**
	 * @returns {Axe} Axe
	 */
	const getBrowserAxe = () => (window || global).axe;

	/**
	 * Get the proper context to pass to axe, according to the specified Pa11y options. It can be an
	 * HTML element or a CSS selector, ready to be used in `axe.run()`
	 * @param {Node | string} rootElement Root element
	 * @returns {Node | string} Axe context element
	 */
	function getAxeContext(rootElement) {
		return rootElement || window.document;
	}

	/**
	 * Create a configuration for `axe.run()` corresponding to Pa11y's current configuration
	 * @returns {AxeRunOptions} Axe configuration
	 */
	const getAxeOptions = ({standard, rules = [], ignore = []}) => ({
		rules: pa11yRulesToAxe(rules, ignore),
		...(standard && {
			runOnly: pa11yStandardToAxe(standard)
		})
	});

	/**
	 * Convert an axe selector array to a selector string.
	 * @param {Array<string>} selectors - The selector parts.
	 * @returns {string} Selector string.
	 */
	const selectorToString = selectors => selectors.join(' ');

	/**
	 * Map Pa11y's 'standard' to axe's 'runOnly'.
	 * @param {string} standard Standard.
	 * @returns {RunOnly} Axe's `runOnly` value.
	 */
	const pa11yStandardToAxe = standard => ({
		type: 'tags',
		values: [
			'wcag2a',
			'wcag21a',
			...(standard === 'WCAG2A' ? [] : [
				'wcag2aa',
				'wcag21aa'
			]),
			'best-practice'
		]
	});

	/**
	 * Map the Pa11y rules option to the axe rules option
	 * @param {Array<string>} rules List of Pa11y rules
	 * @param {Array<string>} ignore List of Pa11y rules to ignore
	 * @returns {Object} Axe rules value
	 */
	const pa11yRulesToAxe = (rules, ignore) => {
		console.log(rules, ignore);
		return Object.assign(
			{},
			...getBrowserAxe()
				.getRules()
				.map(({ruleId}) => ruleId.toLowerCase())
				.map(id => createAxeRule(id, rules, ignore))
				.filter(rule => rule)
		);
	};

	const createAxeRule = (axeId, pa11yRules, pa11yIgnore) => {
		if (pa11yRules.includes(axeId)) {
			return ({
				[axeId]: {
					enabled: true
				}
			});
		}
		if (pa11yIgnore.includes(axeId)) {
			return ({
				[axeId]: {
					enabled: false
				}
			});
		}
		return null;
	};

	/**
	 * Convert an axe impact to a Pa11y reporting level
	 * @param {AxeImpact} impact Axe's impact level
	 * @returns {Pa11yImpact} Pa11y's impact level
	 */
	const axeImpactToPa11yLevel = impact =>
		pa11yLevelByAxeLevel?.[impact] ?? 'error';

	const pa11yLevelByAxeLevel = {
		critical: 'error',
		serious: 'error',
		moderate: 'warning',
		minor: 'notice'
	};

	/**
	 * Process an axe issue.
	 * @param {AxeResult} axeIssue - The axe issue
	 * @returns {Object[]} List of processed issues
	 * @see https://github.com/dequelabs/axe-core/blob/develop/doc/API.md#results-object
	 */
	const processIssue = ({nodes, id, description, help, helpUrl, impact}) => {
		return (nodes.length ? nodes : nodesForNodelessIssue())
			.map(({target}) => target && selectorToString(target))
			.map(selector => selector && window.document.querySelector(selector))
			.map(element => ({
				element,
				code: id,
				type: axeImpactToPa11yLevel(impact),
				message: `${help} (${helpUrl})`,
				runnerExtras: {
					description,
					impact,
					help,
					helpUrl
				}
			}));
	};

	const nodesForNodelessIssue = () => [{
		target: null
	}];

	/**
	 * Run axe on the page
	 * @param {Object} options Axe configuration
	 * @returns {Promise<Array<Pa11yResult>>} A promise of axe issues translated for Pa11y
	 */
	async function runAxeCore({standard, rules, ignore, rootElement}) {
		const {
			violations = [],
			incomplete = []
		} =
			await getBrowserAxe().run(
				getAxeContext(rootElement),
				getAxeOptions({
					standard,
					rules,
					ignore
				})
			);

		const processed = [violations, incomplete]
			.flat()
			.flatMap(processIssue);

		return processed.flat();
	}

	// TODO: Allow this pattern
	/* eslint-disable-next-line */
	return await runAxeCore(options);
};

/**
 * Pa11y runner for axe.
 * @type {import('../pa11y').Pa11yRunner}
 * @see https://www.deque.com/axe/core-documentation/api-documentation/
 */
const runner = {
	run,
	scripts: [`${axePath}/axe.min.js`],
	supports: '^6.0.0 || ^6.0.0-alpha || ^6.0.0-beta'
};

/**
 * Export for CommonJS.
 * For browsers, runners are currently stringified and inserted directly.
 */
module.exports = runner;
