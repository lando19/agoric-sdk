/* global WeakRef */
import { makeMarshal } from '@agoric/marshal';
import { assert } from '@agoric/assert';
import { parseVatSlot } from '../src/parseVatSlots.js';

import { makeCollectionManager } from '../src/kernel/collectionManager.js';

export function makeFakeCollectionManager(options = {}) {
  const { weak = false, log } = options;

  const fakeStore = new Map();
  let sortedKeys;
  let priorKeyReturned;
  let priorKeyIndex;

  function ensureSorted() {
    if (!sortedKeys) {
      sortedKeys = [];
      for (const key of fakeStore.keys()) {
        sortedKeys.push(key);
      }
      sortedKeys.sort((k1, k2) => k1.localeCompare(k2));
    }
  }

  function clearSorted() {
    sortedKeys = undefined;
    priorKeyReturned = undefined;
    priorKeyIndex = -1;
  }

  function dumpStore() {
    ensureSorted();
    return sortedKeys;
  }

  function s(v) {
    switch (typeof v) {
      case 'symbol':
        return v.toString();
      case 'bigint':
        return `${v}n`;
      case 'string':
        return `"${v}"`;
      default:
        return `${v}`;
    }
  }

  const fakeSyscall = {
    vatstoreGet(key) {
      const result = fakeStore.get(key);
      if (log) {
        log.push(`get ${s(key)} => ${s(result)}`);
      }
      return result;
    },
    vatstoreSet(key, value) {
      if (log) {
        log.push(`set ${s(key)} ${s(value)}`);
      }
      if (!fakeStore.has(key)) {
        clearSorted();
      }
      fakeStore.set(key, value);
    },
    vatstoreDelete(key) {
      if (log) {
        log.push(`delete ${s(key)}`);
      }
      if (fakeStore.has(key)) {
        clearSorted();
      }
      fakeStore.delete(key);
    },
    vatstoreGetAfter(priorKey, start, end) {
      ensureSorted();
      let from = 0;
      if (priorKeyReturned === priorKey) {
        from = priorKeyIndex;
      }
      let result;
      for (let i = from; i < sortedKeys.length; i += 1) {
        const key = sortedKeys[i];
        if (key >= end) {
          priorKeyReturned = undefined;
          priorKeyIndex = -1;
          break;
        } else if (key > priorKey && key >= start) {
          priorKeyReturned = key;
          priorKeyIndex = i;
          result = [key, fakeStore.get(key)];
          break;
        }
      }
      if (log) {
        log.push(
          `getAfter ${s(priorKey)} ${s(start)} ${s(end)} => ${s(result)}`,
        );
      }
      return result;
    },
  };

  let nextExportID = 1;
  function fakeAllocateExportID() {
    const exportID = nextExportID;
    nextExportID += 1;
    return exportID;
  }

  // note: The real liveslots slotToVal() maps slots (vrefs) to a WeakRef,
  // and the WeakRef may or may not contain the target value. Use
  // options={weak:true} to match that behavior, or the default weak:false to
  // keep strong references.
  const valToSlot = new WeakMap();
  const slotToVal = new Map();

  function setValForSlot(slot, val) {
    slotToVal.set(slot, weak ? new WeakRef(val) : val);
  }

  function getValForSlot(slot) {
    const d = slotToVal.get(slot);
    return d && (weak ? d.deref() : d);
  }

  function fakeConvertValToSlot(val) {
    if (!valToSlot.has(val)) {
      const slot = `o+${fakeAllocateExportID()}`;
      valToSlot.set(val, slot);
      setValForSlot(slot, val);
    }
    return valToSlot.get(val);
  }

  function fakeConvertSlotToVal(slot) {
    const { type } = parseVatSlot(slot);
    assert.equal(type, 'object');
    return getValForSlot(slot);
  }

  // eslint-disable-next-line no-use-before-define
  const fakeMarshal = makeMarshal(fakeConvertValToSlot, fakeConvertSlotToVal);

  function registerEntry(slot, val) {
    setValForSlot(slot, val);
    valToSlot.set(val, slot);
  }

  function deleteEntry(slot, val) {
    if (!val) {
      val = getValForSlot(slot);
    }
    slotToVal.delete(slot);
    valToSlot.delete(val);
  }

  const {
    makeCollection,
    makeScalarMapStore,
    makeScalarWeakMapStore,
    makeScalarSetStore,
    makeScalarWeakSetStore,
    getCollection,
    M,
  } = makeCollectionManager(
    fakeSyscall,
    fakeConvertValToSlot,
    fakeConvertSlotToVal,
    fakeMarshal.serialize,
    fakeMarshal.unserialize,
  );

  const normalCM = {
    makeCollection,
    makeScalarMapStore,
    makeScalarWeakMapStore,
    makeScalarSetStore,
    makeScalarWeakSetStore,
    getCollection,
    M,
  };

  const debugTools = {
    getValForSlot,
    setValForSlot,
    registerEntry,
    deleteEntry,
    dumpStore,
  };

  return harden({ ...normalCM, ...debugTools });
}
