const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendBroadcastNotification = onDocumentCreated("broadcasts/{broadcastId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log("No data associated with the event");
    return;
  }
  const data = snapshot.data();
  const title = data.title;
  const body = data.body;
  const tripId = data.tripId;

  console.log(`Processing broadcast ${event.params.broadcastId}: ${title} - ${body}`);

  try {
    const usersSnapshot = await admin.firestore()
      .collection("users")
      .where("fcmToken", "!=", null)
      .get();

    const tokens = [];
    const dbWrites = [];
    usersSnapshot.forEach((doc) => {
      const user = doc.data();
      const userId = doc.id;
      if (user.fcmToken && user.fcmToken.trim().length > 0) {
        tokens.push(user.fcmToken);
      }

      const dbWrite = admin.firestore()
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .add({
          title: title,
          body: body,
          tripId: tripId || null,
          isRead: false,
          receivedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp()
        });
      dbWrites.push(dbWrite);
    });

    await Promise.all(dbWrites);

    console.log(`Found ${tokens.length} users with registered tokens.`);

    if (tokens.length === 0) {
      await snapshot.ref.update({
        status: "completed",
        sentCount: 0,
        completedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp()
      });
      return;
    }

    const message = {
      notification: {
        title: title,
        body: body
      },
      android: {
        notification: {
          channelId: "high_importance_channel"
        }
      },
      data: {},
      tokens: tokens
    };

    // Tapping a trip notification opens that trip.
    if (tripId) {
      message.data.tripId = tripId;
    }

    const response = await require('./emulator-messaging.cjs').sendEachForMulticast(message);

    console.log(`Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        console.error(`Token at index ${idx} failed to send. Error:`, res.error);
      }
    });

    await snapshot.ref.update({
      status: "completed",
      sentCount: response.successCount,
      failedCount: response.failureCount,
      completedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.error("Error processing broadcast notification:", error);
    await snapshot.ref.update({
      status: "failed",
      error: error.message || String(error),
      failedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp()
    });
  }
});

exports.onExpenseCreated = onDocumentCreated("trips/{tripId}/expenses/{expenseId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log("No data associated with the event");
    return;
  }
  const expense = snapshot.data();
  const tripId = event.params.tripId;
  const createdBy = expense.createdBy;
  const title = expense.title;
  const amount = expense.amount;
  const paidByName = expense.paidByName || "Someone";

  console.log(`New expense created in trip ${tripId} by user ${createdBy}: ${title} - $${amount}`);

  try {
    const tripSnap = await admin.firestore().collection("trips").doc(tripId).get();
    if (!tripSnap.exists) {
      console.log(`Trip ${tripId} does not exist.`);
      return;
    }
    const trip = tripSnap.data();
    const tripName = trip.name || "Trip";
    const memberUids = trip.memberUids || [];

    const targetUids = memberUids.filter(uid => uid !== createdBy);
    if (targetUids.length === 0) {
      console.log("No other members to notify.");
      return;
    }

    const tokens = [];
    const dbWrites = [];
    for (const uid of targetUids) {
      const dbWrite = admin.firestore()
        .collection("users")
        .doc(uid)
        .collection("notifications")
        .add({
          title: `New Expense in ${tripName}`,
          body: `${paidByName} added "${title}" — ₹${amount}`,
          tripId: tripId,
          isRead: false,
          receivedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp()
        });
      dbWrites.push(dbWrite);

      const userSnap = await admin.firestore().collection("users").doc(uid).get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        if (userData.fcmToken && userData.fcmToken.trim().length > 0) {
          tokens.push(userData.fcmToken);
        }
      }
    }

    await Promise.all(dbWrites);

    if (tokens.length === 0) {
      console.log("No members have registered FCM tokens. Written to Firestore inboxes only.");
      return;
    }

    const message = {
      notification: {
        title: `New Expense in ${tripName}`,
        body: `${paidByName} added "${title}" — ₹${amount}`
      },
      android: {
        notification: {
          channelId: "high_importance_channel"
        }
      },
      data: {
        tripId: tripId
      },
      tokens: tokens
    };

    const response = await require('./emulator-messaging.cjs').sendEachForMulticast(message);
    console.log(`Successfully sent ${response.successCount} expense notifications; ${response.failureCount} failed.`);
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        console.error(`Token at index ${idx} failed to send. Error:`, res.error);
      }
    });
  } catch (error) {
    console.error("Error processing expense notification:", error);
  }
});

async function sendNotificationToUsers(targetUids, title, body, tripId) {
  if (!targetUids || targetUids.length === 0) return;
  const tokens = [];
  const dbWrites = [];
  for (const uid of targetUids) {
    const dbWrite = admin.firestore()
      .collection("users")
      .doc(uid)
      .collection("notifications")
      .add({
        title: title,
        body: body,
        tripId: tripId,
        isRead: false,
        receivedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp()
      });
    dbWrites.push(dbWrite);

    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    if (userSnap.exists) {
      const userData = userSnap.data();
      if (userData.fcmToken && userData.fcmToken.trim().length > 0) {
        tokens.push(userData.fcmToken);
      }
    }
  }

  await Promise.all(dbWrites);

  if (tokens.length === 0) {
    console.log("No users have registered FCM tokens. Written to Firestore inboxes only.");
    return;
  }

  const message = {
    notification: {
      title: title,
      body: body
    },
    android: {
      notification: {
        channelId: "high_importance_channel"
      }
    },
    data: {
      tripId: tripId
    },
    tokens: tokens
  };

  const response = await require('./emulator-messaging.cjs').sendEachForMulticast(message);
  console.log(`Successfully sent ${response.successCount} notifications; ${response.failureCount} failed.`);
}

exports.onTripUpdated = onDocumentUpdated("trips/{tripId}", async (event) => {
  const change = event.data;
  if (!change) {
    console.log("No data associated with the event");
    return;
  }
  const beforeData = change.before.data() || {};
  const afterData = change.after.data() || {};
  const tripId = event.params.tripId;
  const tripName = afterData.name || "Trip";

  const beforePending = beforeData.pendingMemberUids || [];
  const afterPending = afterData.pendingMemberUids || [];
  const beforeMembers = beforeData.memberUids || [];
  const afterMembers = afterData.memberUids || [];

  try {
    const newlyInvited = afterPending.filter(uid => !beforePending.includes(uid));
    if (newlyInvited.length > 0) {
      console.log(`Newly invited users to trip ${tripId}: ${newlyInvited.join(", ")}`);
      await sendNotificationToUsers(
        newlyInvited,
        "Trip Invitation",
        `You have been invited to join the trip "${tripName}"`,
        tripId
      );
    }

    const newlyJoined = afterMembers.filter(uid => !beforeMembers.includes(uid));
    for (const uid of newlyJoined) {
      const joinedName = (afterData.members && afterData.members[uid] && afterData.members[uid].displayName) || "Someone";
      console.log(`User joined trip ${tripId}: ${joinedName} (${uid})`);

      const otherMembers = afterMembers.filter(memberUid => memberUid !== uid);
      if (otherMembers.length > 0) {
        await sendNotificationToUsers(
          otherMembers,
          `New Member in ${tripName}`,
          `${joinedName} joined the trip "${tripName}"`,
          tripId
        );
      }
    }
  } catch (error) {
    console.error("Error processing trip updated notification:", error);
  }
});

exports.onExpenseUpdated = onDocumentUpdated("trips/{tripId}/expenses/{expenseId}", async (event) => {
  const change = event.data;
  if (!change) {
    console.log("No data associated with the event");
    return;
  }
  const before = change.before.data() || {};
  const after = change.after.data() || {};
  const tripId = event.params.tripId;

  let actionText = "";
  if (!before.isDeleted && after.isDeleted) {
    actionText = `deleted "${after.title || before.title}"`;
  } else if (before.isDeleted && !after.isDeleted) {
    actionText = `restored "${after.title}"`;
  } else if (before.amount !== after.amount || before.title !== after.title) {
    actionText = `updated "${before.title}" to "${after.title}" (₹${after.amount})`;
  } else {
    console.log("No notify-worthy change detected in expense.");
    return;
  }

  const editorName = after.lastUpdatedByName || before.lastUpdatedByName || after.paidByName || before.paidByName || "Someone";
  const updatedBy = after.lastUpdatedBy || after.createdBy || before.createdBy;

  try {
    const tripSnap = await admin.firestore().collection("trips").doc(tripId).get();
    if (!tripSnap.exists) {
      console.log(`Trip ${tripId} does not exist.`);
      return;
    }
    const trip = tripSnap.data();
    const tripName = trip.name || "Trip";
    const memberUids = trip.memberUids || [];

    const targetUids = memberUids.filter(uid => uid !== updatedBy);
    if (targetUids.length === 0) {
      console.log("No other members to notify.");
      return;
    }

    const tokens = [];
    const dbWrites = [];
    for (const uid of targetUids) {
      const dbWrite = admin.firestore()
        .collection("users")
        .doc(uid)
        .collection("notifications")
        .add({
          title: `Expense Updated in ${tripName}`,
          body: `${editorName} ${actionText}`,
          tripId: tripId,
          isRead: false,
          receivedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp()
        });
      dbWrites.push(dbWrite);

      const userSnap = await admin.firestore().collection("users").doc(uid).get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        if (userData.fcmToken && userData.fcmToken.trim().length > 0) {
          tokens.push(userData.fcmToken);
        }
      }
    }

    await Promise.all(dbWrites);

    if (tokens.length === 0) {
      console.log("No members have registered FCM tokens. Written to Firestore inboxes only.");
      return;
    }

    const message = {
      notification: {
        title: `Expense Updated in ${tripName}`,
        body: `${editorName} ${actionText}`
      },
      android: {
        notification: {
          channelId: "high_importance_channel"
        }
      },
      data: {
        tripId: tripId
      },
      tokens: tokens
    };

    const response = await require('./emulator-messaging.cjs').sendEachForMulticast(message);
    console.log(`Successfully sent ${response.successCount} updates; ${response.failureCount} failed.`);
  } catch (error) {
    console.error("Error processing expense update notification:", error);
  }
});
