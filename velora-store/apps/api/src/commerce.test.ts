import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSubtotal,transitions} from './commerce.js';
test('totals derive from item snapshots',()=>assert.equal(calculateSubtotal([{price:4500,quantity:2},{price:2000,quantity:1}]),11000));
test('terminal orders cannot be cancelled or fulfilled twice',()=>{assert.deepEqual(transitions.cancelled,[]);assert.deepEqual(transitions.delivered,[]);assert.equal(transitions.shipped.includes('cancelled'),false);});
