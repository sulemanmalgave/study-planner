import { DatabaseSchema } from './types';

export const getInitialClientState = (): DatabaseSchema => {
  return {
    profile: {
      name: 'Student',
      email: '',
      initials: 'ST',
      subscription: {
        subscriptionStatus: 'free',
        plan: null,
        paymentGateway: null,
        transactionId: null,
        purchaseDate: null,
        expiryDate: null,
        billingCountry: 'US',
        paymentProvider: null,
        paymentId: null,
      },
    },
    courses: [],
    timetable: [],
    assignments: [],
    exams: [],
    notes: [],
    studySessions: [],
    audioLectures: [],
    studyMaterials: [],
  };
};

