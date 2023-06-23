import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { DocumentData, getFirestore } from 'firebase-admin/firestore';

admin.initializeApp();
const db = getFirestore();

enum JobApplicationStatus {
  InProgress,
  OfferSent,
  OfferAccepted,
  OfferDeclined,
  ApplicationDeclined,
  Hired,
}

export const processDecentralHireEvents = functions.firestore
  .document('/moralis/events/Decentralhire/{eventId}')
  .onWrite((change) => {
    const message = change.after.data();

    if (message && !message.processed) {
      functions.logger.log('Retrieved event content: ', message);

      try {
        processEventsByType(message);
      } catch (error) {
        functions.logger.error('Failed to process event: ', error);
        return null;
      }

      return change.after.ref.update({
        ...message,
        processed: true,
      });
    }
    return null;
  });

const processEventsByType = (message: DocumentData) => {
  switch (message.name) {
    case 'JobPostingCreatedEvent':
      processJobPostingCreatedEvent(message);
      break;
    case 'JobPostingClosedEvent':
      processJobPostingClosedEvent(message);
      break;
    case 'JobApplicationCreatedEvent':
      processJobApplicationCreatedEvent(message);
      break;
    case 'JobApplicationOfferSentEvent':
      processJobApplicationOfferSentEvent(message);
      break;
    case 'JobApplicationOfferAcceptedEvent':
      processJobApplicationOfferAcceptedEvent(message);
      break;
    case 'JobApplicationOfferDeclinedEvent':
      processJobApplicationOfferDeclinedEvent(message);
      break;
    case 'JobApplicationApplicationDeclinedEvent':
      processJobApplicationApplicationDeclinedEvent(message);
      break;
    case 'JobApplicationHiredEvent':
      processJobApplicationHiredEvent(message);
      break;
    default:
      break;
  }
};

const processJobPostingCreatedEvent = async (message: DocumentData) => {
  const jobPosting = message;

  const companyProfileAddress = (
    jobPosting._companyProfileAddress || ''
  ).toString();
  const jobTitle = jobPosting._title;
  const country = jobPosting._country;
  const city = jobPosting._city;
  const isRemote = jobPosting._isRemote === 'true';
  const contractAddress = (jobPosting._contractAddress || '').toString();

  if (!companyProfileAddress || !contractAddress) {
    functions.logger.log(
      `Failed to process JobPostingCreatedEvent: missing 'companyProfileAddress' or 'contractAddress' (companyProfileAddress: ${companyProfileAddress}, contractAddress: ${contractAddress})`
    );
    return;
  }

  const existingJobPosting = await findJobPostingByContractAddress(
    contractAddress
  );

  const data = {
    contractAddress,
    companyAddress: companyProfileAddress,
    jobTitle,
    country,
    city,
    isRemote,
    isActive: true,
  };

  if (existingJobPosting) {
    await db.collection('JobPostings').doc(existingJobPosting.id).update(data);
  } else {
    // write to the JobPostings document
    await db.collection('JobPostings').add(data);
  }
};

const processJobPostingClosedEvent = async (message: DocumentData) => {
  const jobPosting = message;

  const companyProfileAddress = (
    jobPosting._companyProfileAddress || ''
  ).toString();
  const contractAddress = (jobPosting._contractAddress || '').toString();

  if (!companyProfileAddress || !contractAddress) {
    functions.logger.error(
      `Failed to process JobPostingClosedEvent: missing 'companyProfileAddress' or 'contractAddress' (companyProfileAddress: ${companyProfileAddress}, contractAddress: ${contractAddress})`
    );
    throw new Error(`missing 'companyProfileAddress' or 'contractAddress'`);
  }

  const existingJobPosting = await findJobPostingByContractAddress(
    contractAddress
  );

  if (!existingJobPosting) {
    functions.logger.error(
      `Failed to process JobPostingClosedEvent: JobPosting not found (contractAddress: ${contractAddress})`
    );
    throw new Error(
      `JobPosting not found (contractAddress: ${contractAddress})`
    );
  }

  // update the JobPostings document
  await db
    .collection('JobPostings')
    .doc(existingJobPosting.id)
    .update({
      ...existingJobPosting.data(),
      contractAddress,
      companyAddress: companyProfileAddress,
      isActive: false,
    });
};

const processJobApplicationCreatedEvent = async (message: DocumentData) => {
  const jobApplication = message;

  const from = (jobApplication._from || '').toString();
  const contractAddress = (jobApplication._contractAddress || '').toString();

  if (!from || !contractAddress) {
    functions.logger.error(
      `Failed to process JobApplicationCreatedEvent: missing 'from' or 'contractAddress' (from: ${from}, contractAddress: ${contractAddress})`
    );
    throw new Error(`missing 'from' or 'contractAddress'`);
  }

  const existingJobApplication = await findJobApplicationByContractAddress(
    contractAddress
  );

  const data = {
    contractAddress,
    applicantAddress: from,
    status: JobApplicationStatus.InProgress,
  };

  if (existingJobApplication) {
    await db
      .collection('JobApplications')
      .doc(existingJobApplication.id)
      .update(data);
  } else {
    // write to the JobPostings document
    await db.collection('JobApplications').add(data);
  }
};

const jobApplicationStatusChangeEventBase = async (
  message: DocumentData,
  status: JobApplicationStatus
) => {
  const jobApplication = message;

  const from = (jobApplication._from || '').toString();
  const contractAddress = (jobApplication._contractAddress || '').toString();

  if (!from || !contractAddress) {
    functions.logger.error(
      `Failed to process ${jobApplication.name}: missing 'from' or 'contractAddress' (from: ${from}, contractAddress: ${contractAddress})`
    );
    throw new Error(`missing 'from' or 'contractAddress'`);
  }

  const existingJobApplication = await findJobApplicationByContractAddress(
    contractAddress
  );

  if (!existingJobApplication) {
    functions.logger.error(
      `Failed to process ${jobApplication.name}: JobApplication not found (contractAddress: ${contractAddress})`
    );
    throw new Error(
      `JobApplication not found (contractAddress: ${contractAddress})`
    );
  }

  // update the JobApplications document
  await db
    .collection('JobApplications')
    .doc(existingJobApplication.id)
    .update({
      ...existingJobApplication.data(),
      contractAddress,
      applicantAddress: from,
      status,
    });
};

const processJobApplicationOfferSentEvent = async (message: DocumentData) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferSent
  );
};

const processJobApplicationOfferAcceptedEvent = async (
  message: DocumentData
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferAccepted
  );
};

const processJobApplicationOfferDeclinedEvent = async (
  message: DocumentData
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferDeclined
  );
};

const processJobApplicationApplicationDeclinedEvent = async (
  message: DocumentData
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.ApplicationDeclined
  );
};

const processJobApplicationHiredEvent = async (message: DocumentData) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.Hired
  );
};

const findJobPostingByContractAddress = async (contractAddress: string) => {
  const matchedExistingJobPostings = (
    await db
      .collection('JobPostings')
      .where('contractAddress', '==', contractAddress)
      .get()
  ).docs;

  return matchedExistingJobPostings.length
    ? matchedExistingJobPostings[0]
    : undefined;
};

const findJobApplicationByContractAddress = async (contractAddress: string) => {
  const matchedExistingJobApplications = (
    await db
      .collection('JobApplications')
      .where('contractAddress', '==', contractAddress)
      .get()
  ).docs;

  return matchedExistingJobApplications.length
    ? matchedExistingJobApplications[0]
    : undefined;
};
