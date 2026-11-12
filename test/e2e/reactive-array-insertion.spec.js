// @ts-check
import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

// https://github.com/tabulator-tables/tabulator/issues/5005
const cases = [
    { name: "single prepend", seed: [10, 20], method: "unshift", args: [{ id: 1 }] },
    { name: "batch prepend", seed: [10, 20], method: "unshift", args: [{ id: 1 }, { id: 2 }] },
    { name: "empty single prepend", seed: [], method: "unshift", args: [{ id: 1 }] },
    { name: "empty batch prepend", seed: [], method: "unshift", args: [{ id: 1 }, { id: 2 }] },
    { name: "prepend no arguments", seed: [10, 20], method: "unshift", args: [] },
    { name: "single end splice", seed: [10, 20], method: "splice", args: [2, 0, { id: 1 }] },
    { name: "batch end splice", seed: [10, 20], method: "splice", args: [2, 0, { id: 1 }, { id: 2 }] },
    { name: "empty single splice", seed: [], method: "splice", args: [0, 0, { id: 1 }] },
    { name: "empty batch splice", seed: [], method: "splice", args: [0, 0, { id: 1 }, { id: 2 }] },
    { name: "beyond end splice", seed: [10, 20], method: "splice", args: [99, 0, { id: 1 }, { id: 2 }] },
    { name: "before start splice", seed: [10, 20], method: "splice", args: [-99, 0, { id: 1 }, { id: 2 }] },
    { name: "front splice", seed: [10, 20], method: "splice", args: [0, 0, { id: 1 }, { id: 2 }] },
    { name: "middle splice", seed: [10, 20], method: "splice", args: [1, 0, { id: 1 }, { id: 2 }] },
    { name: "replace tail splice", seed: [10, 20], method: "splice", args: [1, 1, { id: 1 }, { id: 2 }] },
    { name: "negative start splice", seed: [10, 20], method: "splice", args: [-1, 1, { id: 1 }, { id: 2 }] },
    { name: "delete to end splice", seed: [10, 20], method: "splice", args: [1] },
    { name: "end splice no insertion", seed: [10, 20], method: "splice", args: [2, 0] },
    { name: "clamped negative delete count insertion", seed: [10, 20], method: "splice", args: [-99, -1, { id: 1 }, { id: 2 }] },
    { name: "clamped negative delete count no insertion", seed: [10, 20], method: "splice", args: [-99, -1] },
    { name: "front negative delete count insertion", seed: [10, 20], method: "splice", args: [0, -1, { id: 1 }, { id: 2 }] },
    { name: "front negative delete count no insertion", seed: [10, 20], method: "splice", args: [0, -1] },
    { name: "end negative delete count insertion", seed: [10, 20], method: "splice", args: [2, -1, { id: 1 }, { id: 2 }] },
    { name: "middle negative delete count insertion", seed: [10, 20], method: "splice", args: [1, -1, { id: 1 }, { id: 2 }] },
];

for (const scenario of cases) {
    test(scenario.name, async ({ page }) => {
        await page.setContent('<div id="table" style="width:600px"></div>');
        await page.addStyleTag({ path: resolve("dist/css/tabulator.css") });
        await page.addScriptTag({ path: resolve("dist/js/tabulator.js") });
        const result = await page.evaluate(async ({ seed, method, args }) => {
            const data = seed.map(id => ({ id }));
            const expected = data.slice();
            const nativeResult = Array.prototype[method].apply(expected, args);
            const table = new window.Tabulator("#table", {
                data, reactiveData: true, renderVertical: "basic",
                columns: [{ title: "ID", field: "id" }],
            });
            await new Promise(resolve => table.on("tableBuilt", resolve));
            const added = [];
            const changed = [];
            table.on("rowAdded", row => added.push(row.getData().id));
            table.on("dataChanged", rows => changed.push(rows.map(row => row.id)));
            const returned = data[method](...args);
            const snapshot = () => ({
                source: data.map(row => row.id),
                table: table.getData().map(row => row.id),
                rows: table.getRows().map(row => row.getData().id),
                visible: Array.from(document.querySelectorAll('.tabulator-row .tabulator-cell'), cell => Number(cell.textContent)),
            });
            const first = snapshot();
            const returnMatches = Array.isArray(nativeResult)
                ? Array.isArray(returned) && returned.length === nativeResult.length && returned.every((row, i) => row === nativeResult[i])
                : returned === nativeResult;
            const identityMatches = table.getRows().every((row, i) => row.getData() === data[i]);
            const inserted = method === "unshift" ? args : args.slice(2);
            const eventMatches = added.length === inserted.length && inserted.every(row => added.includes(row.id)) && (!inserted.length || changed.some(rows => rows.join() === first.table.join()));
            const sentinel = { id: 99 };
            const nextLength = data.push(sentinel);
            const popped = data.pop();
            const final = snapshot();
            table.destroy();
            return { first, final, expected: expected.map(row => row.id), returnMatches, identityMatches, eventMatches, nextLength, poppedMatches: popped === sentinel };
        }, scenario);
        console.log(JSON.stringify({ scenario: scenario.name, ...result }));
        for (const key of ["source", "table", "rows", "visible"]) {
            expect(result.first[key]).toEqual(result.expected);
            expect(result.final[key]).toEqual(result.expected);
        }
        expect(result.returnMatches).toBe(true);
        expect(result.identityMatches).toBe(true);
        expect(result.eventMatches).toBe(true);
        expect(result.nextLength).toBe(result.expected.length + 1);
        expect(result.poppedMatches).toBe(true);
    });
}

for (const mode of ["group", "tree", "filter", "sort"]) {
    test(`insertion retains ${mode} pipeline`, async ({ page }) => {
        await page.setContent('<div id="table" style="width:600px"></div>');
        await page.addStyleTag({ path: resolve("dist/css/tabulator.css") });
        await page.addScriptTag({ path: resolve("dist/js/tabulator.js") });
        const result = await page.evaluate(async mode => {
            const data = [{ id: 10, group: "a" }, { id: 20, group: "a" }];
            if (mode === "tree") data[0]._children = [{ id: 11, group: "a" }];
            const options = mode === "group" ? { groupBy: "group", groupStartOpen: true }
                : mode === "tree" ? { dataTree: true, dataTreeStartExpanded: true }
                    : mode === "filter" ? { initialFilter: [{ field: "id", type: ">", value: 5 }] }
                        : { initialSort: [{ column: "id", dir: "desc" }] };
            const table = new window.Tabulator("#table", {
                data, reactiveData: true, renderVertical: "basic", ...options,
                columns: [{ title: "ID", field: "id", sorter: "number" }],
            });
            await new Promise(resolve => table.on("tableBuilt", resolve));
            data.unshift({ id: 1, group: "a" }, { id: 2, group: "a" });
            data.splice(data.length, 0, { id: 30, group: "a" }, { id: 40, group: "a" });
            const inserted = table.getData().map(row => row.id);
            if (mode === "filter") await table.setFilter("id", ">", 5);
            if (mode === "sort") await table.setSort("id", "desc");
            const result = {
                source: data.map(row => row.id), inserted,
                active: table.getData("active").map(row => row.id),
                visible: Array.from(document.querySelectorAll('.tabulator-row .tabulator-cell'), cell => Number(cell.textContent)),
                group: mode === "group" ? table.getGroups()[0].getRows().map(row => row.getData().id) : [],
                children: mode === "tree" ? table.getRow(10).getTreeChildren().map(row => row.getData().id) : [],
            };
            table.destroy();
            return result;
        }, mode);
        console.log(JSON.stringify({ scenario: `pipeline ${mode}`, ...result }));
        expect(result.source).toEqual([1, 2, 10, 20, 30, 40]);
        expect(result.inserted).toEqual(result.source);
        if (mode === "filter") {
            expect(result.active).toEqual([10, 20, 30, 40]);
            expect(result.visible).toEqual(result.active);
        } else if (mode === "sort") {
            expect(result.active).toEqual([40, 30, 20, 10, 2, 1]);
            expect(result.visible).toEqual(result.active);
        } else if (mode === "tree") {
            expect(result.children).toEqual([11]);
            expect(result.visible).toEqual([1, 2, 10, 11, 20, 30, 40]);
        } else {
            expect(result.group).toEqual(result.source);
            expect(result.visible).toEqual(result.source);
        }
    });
}
