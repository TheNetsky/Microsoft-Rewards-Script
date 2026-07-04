import assert from 'node:assert/strict'
import test from 'node:test'

import { formatCurrentValueSuffix, getNextMenuIndex, MenuController } from '../../cli/InteractiveMenu'

test('formatCurrentValueSuffix hides current values', () => {
    assert.equal(formatCurrentValueSuffix('super-secret'), ' [current set]')
    assert.equal(formatCurrentValueSuffix(''), '')
})

test('getNextMenuIndex wraps around the option list', () => {
    assert.equal(getNextMenuIndex(0, -1, 3), 2)
    assert.equal(getNextMenuIndex(2, 1, 3), 0)
})

test('MenuController updates and submits the selected option', () => {
    const controller = new MenuController(3)

    assert.deepEqual(controller.handleKey({ name: 'down' }), { type: 'update', selectedIndex: 1 })
    assert.deepEqual(controller.handleKey({ name: 'end' }), { type: 'update', selectedIndex: 2 })
    assert.deepEqual(controller.handleKey({ name: 'return' }), { type: 'submit', selectedIndex: 2 })
})

test('MenuController reports interrupts for ctrl+c', () => {
    const controller = new MenuController(2, 1)

    assert.deepEqual(controller.handleKey({ name: 'c', ctrl: true }), { type: 'interrupt', selectedIndex: 1 })
})
