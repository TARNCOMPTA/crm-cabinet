import { useState, useEffect } from 'react';
import { AlertTriangle, UserX, Users, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Database } from '../../types/database';
import {
  checkUserDependencies,
  deactivateUser,
  UserDependencies,
} from '../../lib/userDeactivationService';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface DeactivateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: Profile;
  availableUsers: Profile[];
  onSuccess: () => void;
}

export default function DeactivateUserModal({
  isOpen,
  onClose,
  user,
  availableUsers,
  onSuccess,
}: DeactivateUserModalProps) {
  const [step, setStep] = useState(1);
  const [dependencies, setDependencies] = useState<UserDependencies | null>(null);
  const [selectedReplacementId, setSelectedReplacementId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedReplacementId('');
      setIsLoading(true);
      checkUserDependencies(user.id).then((deps) => {
        setDependencies(deps);
        setIsLoading(false);
      });
    }
  }, [isOpen, user.id]);

  const totalDependencies = dependencies
    ? dependencies.clientsCount +
      dependencies.tasksCount +
      dependencies.balanceSheetsCount +
      dependencies.bilanCardsCount
    : 0;

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleConfirm = async () => {
    if (!currentUser) return;

    setIsProcessing(true);
    const result = await deactivateUser(
      user.id,
      currentUser.id,
      selectedReplacementId || null
    );

    setIsProcessing(false);

    if (result.success) {
      showToast('Utilisateur désactivé avec succès', 'success');
      onSuccess();
      onClose();
    } else {
      showToast(result.error || 'Erreur lors de la désactivation', 'error');
    }
  };

  const userName = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Désactiver un utilisateur">
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              1
            </div>
            <div className="h-px w-12 bg-gray-300"></div>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              2
            </div>
            <div className="h-px w-12 bg-gray-300"></div>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              3
            </div>
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-start space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-yellow-900 mb-1">
                  Désactivation du compte
                </h4>
                <p className="text-sm text-yellow-800">
                  Vous êtes sur le point de désactiver le compte de{' '}
                  <strong>{userName}</strong>. L'utilisateur ne pourra plus se connecter.
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">
                  Vérification des dépendances...
                </p>
              </div>
            ) : dependencies ? (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Éléments assignés</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-2xl font-bold text-gray-900">
                      {dependencies.clientsCount}
                    </div>
                    <div className="text-sm text-gray-600">Clients</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-2xl font-bold text-gray-900">
                      {dependencies.tasksCount}
                    </div>
                    <div className="text-sm text-gray-600">Tâches en cours</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-2xl font-bold text-gray-900">
                      {dependencies.balanceSheetsCount}
                    </div>
                    <div className="text-sm text-gray-600">Bilans en cours</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-2xl font-bold text-gray-900">
                      {dependencies.bilanCardsCount}
                    </div>
                    <div className="text-sm text-gray-600">Cartes bilan</div>
                  </div>
                </div>
                {totalDependencies > 0 && (
                  <p className="text-sm text-gray-600">
                    Ces éléments peuvent être réassignés à un autre collaborateur à
                    l'étape suivante.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-start space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-900 mb-1">Réassignation</h4>
                <p className="text-sm text-blue-800">
                  {totalDependencies > 0
                    ? 'Choisissez un collaborateur pour reprendre les éléments assignés, ou laissez-les non assignés.'
                    : 'Aucun élément à réassigner.'}
                </p>
              </div>
            </div>

            {totalDependencies > 0 && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Collaborateur de remplacement (optionnel)
                </label>
                <select
                  value={selectedReplacementId}
                  onChange={(e) => setSelectedReplacementId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Laisser non assigné</option>
                  {availableUsers
                    .filter((u) => u.id !== user.id && u.is_active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {`${u.prenom || ''} ${u.nom || ''}`.trim() || u.email}
                      </option>
                    ))}
                </select>
                {selectedReplacementId && (
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium mb-1">Ce qui sera réassigné :</p>
                    <ul className="list-disc list-inside space-y-1">
                      {dependencies?.clientsCount ? (
                        <li>{dependencies.clientsCount} client(s)</li>
                      ) : null}
                      {dependencies?.tasksCount ? (
                        <li>{dependencies.tasksCount} tâche(s) en cours</li>
                      ) : null}
                      {dependencies?.balanceSheetsCount ? (
                        <li>{dependencies.balanceSheetsCount} bilan(s) en cours</li>
                      ) : null}
                      {dependencies?.bilanCardsCount ? (
                        <li>{dependencies.bilanCardsCount} carte(s) bilan</li>
                      ) : null}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-start space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-green-900 mb-1">Confirmation</h4>
                <p className="text-sm text-green-800">
                  Vérifiez les informations avant de confirmer la désactivation.
                </p>
              </div>
            </div>

            <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div>
                <span className="text-sm font-medium text-gray-700">Utilisateur :</span>
                <p className="text-gray-900">{userName}</p>
              </div>
              {totalDependencies > 0 && (
                <>
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Éléments concernés :
                    </span>
                    <p className="text-gray-900">{totalDependencies} élément(s)</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Action de réassignation :
                    </span>
                    <p className="text-gray-900">
                      {selectedReplacementId
                        ? availableUsers.find((u) => u.id === selectedReplacementId)
                          ? `Réassigner à ${
                              `${
                                availableUsers.find((u) => u.id === selectedReplacementId)
                                  ?.prenom || ''
                              } ${
                                availableUsers.find((u) => u.id === selectedReplacementId)
                                  ?.nom || ''
                              }`.trim() ||
                              availableUsers.find((u) => u.id === selectedReplacementId)
                                ?.email
                            }`
                          : 'Réassigner'
                        : 'Laisser non assigné'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-start space-x-2 text-sm text-gray-600">
              <UserX className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Le compte sera désactivé immédiatement et l'utilisateur ne pourra plus se
                connecter. Toutes les données historiques seront conservées.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4 border-t">
          {step > 1 && (
            <Button variant="secondary" onClick={handleBack} disabled={isProcessing}>
              Retour
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
            Annuler
          </Button>
          {step < 3 ? (
            <Button onClick={handleNext} disabled={isLoading}>
              Suivant
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={handleConfirm}
              disabled={isProcessing}
            >
              {isProcessing ? 'Désactivation...' : 'Confirmer la désactivation'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
