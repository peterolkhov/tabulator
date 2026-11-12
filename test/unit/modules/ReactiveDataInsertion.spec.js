import ReactiveData from "../../../src/js/modules/ReactiveData/ReactiveData";

// https://github.com/tabulator-tables/tabulator/issues/5005
describe("ReactiveData insertion translation", () => {
    let reactiveData, rowManager;

    beforeEach(() => {
        jest.spyOn(ReactiveData.prototype, "registerTableOption").mockImplementation(() => {});
        rowManager = {
            addRowActual: jest.fn(),
            getRowFromDataObject: jest.fn(data => ({ data })),
            reRenderInPosition: jest.fn(),
        };
        reactiveData = new ReactiveData({ rowManager });
    });

    afterEach(() => jest.restoreAllMocks());

    it("prepends in reverse insertion order without reversing the source batch", () => {
        const data = [{ id: 10 }];
        const batch = [{ id: 1 }, { id: 2 }];
        reactiveData.watchData(data);
        expect(data.unshift(...batch)).toBe(3);
        expect(rowManager.addRowActual.mock.calls).toEqual([[batch[1], true], [batch[0], true]]);
        expect(data.slice()).toEqual([batch[0], batch[1], { id: 10 }]);
        expect(batch.map(row => row.id)).toEqual([1, 2]);
        expect(reactiveData.blocked).toBe(false);
    });

    it.each([{ seed: [] }, { seed: [{ id: 10 }] }])("appends an end-splice batch in argument order to $seed", ({ seed }) => {
        const data = seed.slice();
        const batch = [{ id: 1 }, { id: 2 }];
        reactiveData.watchData(data);
        expect(data.splice(data.length, 0, ...batch)).toEqual([]);
        expect(rowManager.addRowActual.mock.calls).toEqual([[batch[0], false, false, true], [batch[1], false, false, true]]);
        expect(data.slice()).toEqual([...seed, ...batch]);
        expect(rowManager.reRenderInPosition).toHaveBeenCalledTimes(1);
        expect(reactiveData.blocked).toBe(false);
    });

    it("clamps a negative start before the beginning to the first-row anchor", () => {
        const first = { id: 10 };
        const anchor = { data: first };
        const data = [first, { id: 20 }];
        const batch = [{ id: 1 }, { id: 2 }];
        rowManager.getRowFromDataObject.mockReturnValue(anchor);
        reactiveData.watchData(data);
        expect(data.splice(-99, 0, ...batch)).toEqual([]);
        expect(rowManager.getRowFromDataObject).toHaveBeenCalledWith(first);
        expect(rowManager.addRowActual.mock.calls).toEqual([[batch[0], true, anchor, true], [batch[1], true, anchor, true]]);
        expect(data.slice()).toEqual([...batch, first, { id: 20 }]);
    });

    // https://github.com/tabulator-tables/tabulator/issues/5005
    it.each([
        { start: -99, insert: true },
        { start: -99, insert: false },
        { start: 0, insert: true },
        { start: 0, insert: false },
        { start: 1, insert: true },
        { start: 2, insert: true },
    ])("treats negative deleteCount as zero at start $start with insertion $insert", ({ start, insert }) => {
        const data = [{ id: 10 }, { id: 20 }];
        const removed = { deleteActual: jest.fn() };
        const batch = insert ? [{ id: 1 }, { id: 2 }] : [];
        const expected = data.slice();
        rowManager.getRowFromDataObject.mockReturnValue(removed);
        reactiveData.watchData(data);
        expect(data.splice(start, -1, ...batch)).toEqual(expected.splice(start, -1, ...batch));
        expect(data.slice()).toEqual(expected);
        expect(removed.deleteActual).not.toHaveBeenCalled();
        expect(reactiveData.blocked).toBe(false);
        const sentinel = { id: 99 };
        expect(data.push(sentinel)).toBe(expected.length + 1);
        expect(rowManager.addRowActual).toHaveBeenLastCalledWith(sentinel, false);
    });

    it("keeps the existing reactivity block and version guards", () => {
        const data = [{ id: 10 }];
        reactiveData.watchData(data);
        const unshift = data.unshift;
        const splice = data.splice;
        reactiveData.block("outer");
        expect(data.unshift({ id: 1 }, { id: 2 })).toBeUndefined();
        expect(data.splice(1, 0, { id: 3 })).toBeUndefined();
        expect(reactiveData.blocked).toBe("outer");
        reactiveData.unblock("outer");
        reactiveData.watchData([]);
        expect(unshift({ id: 4 })).toBeUndefined();
        expect(splice(1, 0, { id: 5 })).toBeUndefined();
        expect(rowManager.addRowActual).not.toHaveBeenCalled();
        expect(data.slice()).toEqual([{ id: 10 }]);
    });
});
