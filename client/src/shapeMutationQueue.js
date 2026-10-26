export function enqueueShapeDeletion(queue, databaseId) {
    if (!databaseId) return false;
    queue.add(databaseId);
    return true;
}

export function takeShapeDeletionBatch(queue) {
    const batch = Array.from(queue);
    queue.clear();
    return batch;
}

export function enqueueShapeRecolor(queue, color, databaseId) {
    if (!databaseId) return false;
    if (queue[color] === undefined) queue[color] = [];
    if (!queue[color].includes(databaseId)) queue[color].push(databaseId);
    return true;
}

export function takeShapeRecolorBatch(queue) {
    const color = Object.keys(queue)[0];
    if (color === undefined) return null;

    const databaseIds = queue[color];
    delete queue[color];
    return { color, databaseIds };
}